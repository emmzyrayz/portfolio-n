import { z } from "zod";

// Shared by the owner Server Actions (authoritative), the editor (hints) and the hub endpoint (?keys=).

export const CONFIG_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const MAX_CONFIG_KEYS = 100;
export const MAX_VALUE_BYTES = 16 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024;
/** Most keys a client may request with ?keys=. */
export const MAX_KEYS_FILTER = 50;

const byteLength = (s: string) => new TextEncoder().encode(s).length;

export const configEntrySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(CONFIG_KEY_PATTERN, "Use lowercase letters, numbers, dots, dashes or underscores (max 64, starting with a letter or number)."),
  /** Any JSON value (boolean flags, numbers, strings, objects, arrays, null). */
  value: z.unknown().refine((v) => v !== undefined, "A value is required."),
});

export const configPayloadSchema = z
  .array(configEntrySchema)
  .max(MAX_CONFIG_KEYS, `At most ${MAX_CONFIG_KEYS} keys per project.`)
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    let total = 0;
    entries.forEach((entry, index) => {
      if (seen.has(entry.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "Duplicate key." });
      seen.add(entry.key);

      const size = byteLength(JSON.stringify(entry.value) ?? "");
      total += size;
      if (size > MAX_VALUE_BYTES) {
        ctx.addIssue({ code: "custom", path: [index, "value"], message: `Value is too large (max ${MAX_VALUE_BYTES / 1024} KB).` });
      }
    });
    if (total > MAX_TOTAL_BYTES) {
      ctx.addIssue({ code: "custom", path: [], message: `Total config is too large (max ${MAX_TOTAL_BYTES / 1024} KB).` });
    }
  });

export type ConfigEntry = { key: string; value: unknown };

/** Parses ?keys=a,b,c. Returns null when absent, or an error string when invalid. */
export function parseKeysParam(raw: string | null): { keys: string[] | null } | { error: string } {
  if (raw === null) return { keys: null };
  const keys = [...new Set(raw.split(",").map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return { error: "keys must list at least one key." };
  if (keys.length > MAX_KEYS_FILTER) return { error: `keys accepts at most ${MAX_KEYS_FILTER} keys.` };
  if (!keys.every((k) => CONFIG_KEY_PATTERN.test(k))) return { error: "keys contains an invalid key name." };
  return { keys };
}
