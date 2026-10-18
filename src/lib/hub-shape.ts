// Pure constants and parsing shared by src/proxy.ts (cheap shape check) and src/lib/hub.ts (the real
// check). No Node APIs, no server-only, no I/O: it must be safe to load from the proxy.

export const HUB_KEY_PREFIX = "hub_live_";
/** hub_live_ + 43 base64url chars (32 random bytes). */
export const HUB_KEY_PATTERN = /^hub_live_[A-Za-z0-9_-]{43}$/;
/** App slugs double as the public `x-app-id`. */
export const APP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const APP_SLUG_MAX = 40;

export function readBearer(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match ? match[1] : null;
}

export type HubCredentials = { appId: string; key: string };

/** Returns the credentials when both headers are present and well-formed, else null. No lookups. */
export function parseHubHeaders(headers: Headers): HubCredentials | null {
  const appId = headers.get("x-app-id")?.trim() ?? "";
  const key = readBearer(headers.get("authorization"));
  if (!appId || appId.length > APP_SLUG_MAX || !APP_SLUG_PATTERN.test(appId)) return null;
  if (!key || !HUB_KEY_PATTERN.test(key)) return null;
  return { appId, key };
}

/** The one error body every authentication failure returns: nothing about tenants or keys leaks. */
export const UNAUTHORIZED_BODY = { error: { code: "unauthorized", message: "Invalid or missing credentials." } } as const;
