import { after } from "next/server";
import { withHub } from "@/lib/hub";
import { MAX_REQUEST_BYTES, parseTelemetryBody } from "@/lib/telemetry-schemas";
import { maybePruneTelemetry, reserveTelemetryQuota, syncTelemetryCounters, writeTelemetry } from "@/lib/telemetry-hub";

// Structured logs / errors from a client project. One event object, or an array of 1-10 (all-or-nothing).
// 202 Accepted means "validated and queued": the insert happens after the response, best effort, so a
// warm request touches no database. The tenant comes ONLY from the authenticated key.
//
// Clients must not send personal data or secrets. Secret-looking keys and tokens are redacted
// server-side as a safety net, not as permission.

const invalidRequest = (fields: string[]) =>
  Response.json({ error: { code: "invalid_request", message: "The request body is invalid.", fields } }, { status: 400 });

export const POST = withHub(async ({ app, key }, request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return invalidRequest(["content-type"]);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
    return Response.json({ error: { code: "payload_too_large", message: "The request body is too large." } }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalidRequest(["body"]);
  }

  // Generic 400: field paths only. Invalid requests use no quota and store nothing.
  const parsed = parseTelemetryBody(json);
  if (!parsed.ok) return invalidRequest(parsed.fields);
  const { events } = parsed;

  // Instant, in-memory decision (no database); over quota -> 429 and the events are dropped.
  const quota = reserveTelemetryQuota(app.id, events.length);
  if (!quota.ok) {
    return Response.json(
      { error: { code: "quota_exceeded", message: quota.scope === "tenant" ? "Hourly telemetry quota reached for this project." : "Telemetry capacity is temporarily exhausted. Try again later." } },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
    );
  }

  after(async () => {
    try {
      await writeTelemetry(app.id, key.id, events);
      await syncTelemetryCounters(app.id, events.length);
      await maybePruneTelemetry();
    } catch (error) {
      // Best effort by design: report to the server log (never the events themselves), never to the client.
      console.error("hub telemetry: background write failed", error instanceof Error ? error.message : error);
    }
  });

  return Response.json({ ok: true, accepted: events.length }, { status: 202 });
});
