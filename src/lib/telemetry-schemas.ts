import { z } from "zod";

// Pure (no I/O, no server-only): used by the hub endpoint and by unit tests.

export const LEVELS = ["debug", "info", "warn", "error", "fatal"] as const;
export type Level = (typeof LEVELS)[number];

export const MAX_EVENTS_PER_REQUEST = 10;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_PAYLOAD_BYTES = 8 * 1024;
export const MAX_PAYLOAD_DEPTH = 6;
export const MAX_PAYLOAD_NODES = 500;
export const MAX_REQUEST_BYTES = 64 * 1024;

export const EVENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

/** Everything except tab, LF and CR. NUL is among these: Postgres text/jsonb cannot store it. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/* ---------- redaction ---------- */

/** Keys whose values are never stored. Substring match, so `user_password` and `apiKey` are caught too. */
const SENSITIVE_KEY = /(password|passwd|pwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential|session[-_]?id)/i;

const REDACTIONS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]"],
  [/hub_live_[A-Za-z0-9_-]{20,}/g, "[redacted-hub-key]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-jwt]"],
];

export function cleanString(value: string, counter?: { n: number }): string {
  let out = value.replace(CONTROL_CHARS, "");
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, () => {
      if (counter) counter.n += 1;
      return replacement;
    });
  }
  return out;
}

/** Deep copy with control characters stripped, secret-looking strings masked and sensitive keys redacted. */
export function redactValue(value: unknown, counter: { n: number }): unknown {
  if (typeof value === "string") return cleanString(value, counter);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, counter));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = key.replace(CONTROL_CHARS, "").slice(0, 100);
      if (SENSITIVE_KEY.test(safeKey)) {
        counter.n += 1;
        out[safeKey] = "[redacted]";
      } else {
        out[safeKey] = redactValue(v, counter);
      }
    }
    return out;
  }
  return value;
}

/* ---------- validation ---------- */

/** Walks the payload once: JSON types only, bounded depth and node count. Returns an error or null. */
function payloadProblem(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "payload must be a JSON object";
  let nodes = 0;
  const walk = (v: unknown, depth: number): string | null => {
    if (++nodes > MAX_PAYLOAD_NODES) return "payload has too many values";
    if (depth > MAX_PAYLOAD_DEPTH) return "payload is nested too deeply";
    if (v === null || typeof v === "string" || typeof v === "boolean") return null;
    if (typeof v === "number") return Number.isFinite(v) ? null : "payload numbers must be finite";
    if (Array.isArray(v)) {
      for (const item of v) {
        const problem = walk(item, depth + 1);
        if (problem) return problem;
      }
      return null;
    }
    if (typeof v === "object") {
      for (const item of Object.values(v as Record<string, unknown>)) {
        const problem = walk(item, depth + 1);
        if (problem) return problem;
      }
      return null;
    }
    return "payload must be plain JSON";
  };
  const problem = walk(value, 1);
  if (problem) return problem;
  return new TextEncoder().encode(JSON.stringify(value)).length > MAX_PAYLOAD_BYTES ? `payload is larger than ${MAX_PAYLOAD_BYTES / 1024} KB` : null;
}

export const telemetryEventSchema = z.strictObject({
  event_type: z.string().regex(EVENT_TYPE_PATTERN, "invalid event_type"),
  level: z.enum(LEVELS),
  message: z
    .string()
    .max(MAX_MESSAGE_LENGTH * 2)
    .transform((m) => m.replace(CONTROL_CHARS, "").trim())
    .pipe(z.string().min(1).max(MAX_MESSAGE_LENGTH)),
  payload: z
    .unknown()
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined) return;
      const problem = payloadProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
});

export type TelemetryEvent = {
  event_type: string;
  level: Level;
  message: string;
  payload?: Record<string, unknown>;
};

export type ParsedTelemetry = { ok: true; events: TelemetryEvent[]; redactions: number } | { ok: false; fields: string[] };

/**
 * Accepts one event object or an array of 1-10. All-or-nothing: one bad event rejects the whole request.
 * On failure only field PATHS are returned ("2.level" for batches, "level" for a single event), never
 * submitted values or internal messages. On success the events are already redacted and sanitised.
 */
export function parseTelemetryBody(json: unknown): ParsedTelemetry {
  const isBatch = Array.isArray(json);
  const items = isBatch ? json : [json];
  if (items.length < 1 || items.length > MAX_EVENTS_PER_REQUEST) return { ok: false, fields: ["body"] };

  const fields = new Set<string>();
  const events: TelemetryEvent[] = [];
  const counter = { n: 0 };

  items.forEach((item, index) => {
    const parsed = telemetryEventSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = typeof issue.path[0] === "string" ? issue.path[0] : "";
        fields.add(isBatch ? (field ? `${index}.${field}` : String(index)) : field || "body");
      }
      return;
    }
    const { event_type, level, message, payload } = parsed.data;
    events.push({
      event_type,
      level,
      message: cleanString(message, counter),
      ...(payload !== undefined ? { payload: redactValue(payload, counter) as Record<string, unknown> } : {}),
    });
  });

  return fields.size > 0 ? { ok: false, fields: [...fields] } : { ok: true, events, redactions: counter.n };
}

/* ---------- inspector filters (owner dashboard) ---------- */

export const LEVEL_FILTERS = ["all", "errors", "warn", "info", "debug"] as const;
export const RANGES = ["1h", "24h", "7d", "30d"] as const;
export type LevelFilter = (typeof LEVEL_FILTERS)[number];
export type Range = (typeof RANGES)[number];

export const RANGE_SECONDS: Record<Range, number> = { "1h": 3600, "24h": 86_400, "7d": 7 * 86_400, "30d": 30 * 86_400 };

/** Levels included by each filter: "errors" = error + fatal, "warn" = warn and above. */
export const FILTER_LEVELS: Record<LevelFilter, readonly Level[]> = {
  all: LEVELS,
  errors: ["error", "fatal"],
  warn: ["warn", "error", "fatal"],
  info: ["info"],
  debug: ["debug"],
};

export type InspectorFilters = { level: LevelFilter; type: string; range: Range; q: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Untrusted query-string values in, safe filters out: anything invalid falls back to a default. */
export function parseInspectorFilters(params: Record<string, string | string[] | undefined>): InspectorFilters {
  const level = first(params.level);
  const range = first(params.range);
  const type = first(params.type)?.trim() ?? "";
  const q = (first(params.q) ?? "").replace(CONTROL_CHARS, "").trim().slice(0, 100);
  return {
    level: (LEVEL_FILTERS as readonly string[]).includes(level ?? "") ? (level as LevelFilter) : "all",
    range: (RANGES as readonly string[]).includes(range ?? "") ? (range as Range) : "24h",
    type: EVENT_TYPE_PATTERN.test(type) ? type : "",
    q,
  };
}
