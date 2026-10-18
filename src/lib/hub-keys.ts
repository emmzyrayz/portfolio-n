import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { HUB_KEY_PREFIX } from "@/lib/hub-shape";

/**
 * Hub API keys: 256 bits of randomness, so a fast keyed hash (HMAC-SHA256) is the right tool and
 * allows an indexed lookup by hash. HUB_KEY_SECRET is separate from SESSION_SECRET on purpose:
 * rotating sessions must never invalidate client keys. Rotating HUB_KEY_SECRET invalidates ALL keys.
 */
function secret() {
  const value = process.env.HUB_KEY_SECRET;
  if (!value || value.length < 32) throw new Error("HUB_KEY_SECRET must be set (32+ characters)");
  return value;
}

export function hashApiKey(key: string) {
  return createHmac("sha256", secret()).update(`hub-key:${key}`).digest("hex");
}

export type GeneratedKey = { raw: string; hash: string; prefix: string };

/** The raw key exists only in this return value: show it once, never store or log it. */
export function generateApiKey(): GeneratedKey {
  const raw = `${HUB_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, HUB_KEY_PREFIX.length + 4) };
}
