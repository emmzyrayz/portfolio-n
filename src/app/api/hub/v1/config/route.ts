import { parseKeysParam } from "@/lib/config-schemas";
import { etagFor, etagMatches, getConfigSnapshot, pickKeys } from "@/lib/hub-config";
import { withHub } from "@/lib/hub";

// A tenant's remote config / feature flags. Read-only: writes are owner-only, in the dashboard.
// The tenant comes ONLY from the authenticated key (ctx.app.id); nothing in the request can select another.
//
//   GET /api/hub/v1/config                 -> every key
//   GET /api/hub/v1/config?keys=a,b        -> only those keys (unknown keys are absent)
//   If-None-Match: <etag>                  -> 304 with no body when nothing changed
const cacheControl = "private, max-age=0, must-revalidate"; // tenant-private: never shared by a CDN

export const GET = withHub(async ({ app }, request) => {
  const parsed = parseKeysParam(new URL(request.url).searchParams.get("keys"));
  if ("error" in parsed) {
    return Response.json({ error: { code: "bad_request", message: parsed.error } }, { status: 400 });
  }

  const snapshot = await getConfigSnapshot(app.id); // warm: served from memory, no database call
  const etag = etagFor(snapshot.version, parsed.keys ?? undefined);
  const headers = { ETag: etag, "Cache-Control": cacheControl };

  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  return Response.json(
    {
      app: app.slug,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt,
      config: parsed.keys ? pickKeys(snapshot.config, parsed.keys) : snapshot.config,
    },
    { headers },
  );
});
