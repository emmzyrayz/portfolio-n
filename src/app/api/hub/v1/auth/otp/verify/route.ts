import { AUTH_WINDOW_MS, VERIFY_LIMIT, emailCounterKey, verifyOtp } from "@/lib/hub-auth";
import { invalidFields, otpVerifySchema } from "@/lib/hub-auth-schemas";
import { withHub } from "@/lib/hub";
import { hitRateLimit } from "@/lib/rate-limit";

// Completes a sign-in. Every failure (unknown email, wrong, expired, locked, already used) is the same
// 401, so the response never reveals which one it was.
const MAX_BODY_BYTES = 1024;

const invalidRequest = (fields: string[]) =>
  Response.json({ error: { code: "invalid_request", message: "The request body is invalid.", fields } }, { status: 400 });

export const POST = withHub(async ({ app }, request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return invalidRequest(["content-type"]);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return Response.json({ error: { code: "payload_too_large", message: "The request body is too large." } }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalidRequest(["body"]);
  }
  const parsed = otpVerifySchema.safeParse(json);
  if (!parsed.success) return invalidRequest(invalidFields(parsed.error.issues));
  const { email, code } = parsed.data;

  const limit = await hitRateLimit(emailCounterKey("ver", app.id, email), VERIFY_LIMIT, AUTH_WINDOW_MS);
  if (limit.limited) {
    return Response.json(
      { error: { code: "rate_limited", message: "Too many attempts. Try again later." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await verifyOtp(app.id, email, code);
  if (!result.ok) return Response.json({ error: { code: "invalid_code", message: "The code is invalid or has expired." } }, { status: 401 });

  return Response.json({
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
    user: { id: result.user.id, email: result.user.email, role: result.user.role, metadata: result.user.metadata },
  });
});
