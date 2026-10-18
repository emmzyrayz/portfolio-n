import Link from "next/link";
import type { TelemetryPage, TelemetrySummary } from "@/lib/telemetry-admin";
import { LEVELS, LEVEL_FILTERS, RANGES, type InspectorFilters, type Level } from "@/lib/telemetry-schemas";

export type InspectorState = { filters: InspectorFilters; page: TelemetryPage };

const LEVEL_LABEL: Record<(typeof LEVEL_FILTERS)[number], string> = {
  all: "All levels",
  errors: "Errors (error + fatal)",
  warn: "Warnings and above",
  info: "Info only",
  debug: "Debug only",
};

const badgeClass: Record<Level, string> = {
  fatal: "border-error bg-error text-paper",
  error: "border-error text-error",
  warn: "border-amber-600 text-amber-700",
  info: "border-ink text-ink",
  debug: "border-zinc-400 text-zinc-500",
};

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function href(slug: string, filters: InspectorFilters, before?: string | null) {
  const params = new URLSearchParams({ inspect: slug, level: filters.level, range: filters.range });
  if (filters.type) params.set("type", filters.type);
  if (filters.q) params.set("q", filters.q);
  if (before) params.set("before", before);
  return `/dashboard/apps?${params.toString()}#tel-${slug}`;
}

/** Payload as pretty JSON text, clamped. It is client-controlled, so it is only ever rendered as text. */
function payloadText(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n... (truncated for display)` : text;
}

const fieldClass = "rounded-md border-2 border-ink bg-paper px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ink";

/**
 * Read-only log analysis for one tenant. Server component: filtering is plain GET links/forms, so it
 * works without client JS and every view is shareable. All client-controlled text (event types,
 * messages, payloads) is rendered as plain text; nothing here uses dangerouslySetInnerHTML.
 */
export function TelemetryInspector({ slug, name, summary, inspector }: { slug: string; name: string; summary: TelemetrySummary; inspector?: InspectorState }) {
  const total = LEVELS.reduce((n, l) => n + summary.counts[l], 0);
  const errors = summary.counts.error + summary.counts.fatal;
  const filters: InspectorFilters = inspector?.filters ?? { level: "all", range: "24h", type: "", q: "" };

  return (
    <section id={`tel-${slug}`} aria-label={`Telemetry for ${name}`}>
      <details open={Boolean(inspector)} className="rounded-md border border-zinc-300 p-3">
        <summary className="cursor-pointer text-sm font-bold">
          Telemetry ({total} in 24h{errors > 0 ? `, ${errors} errors` : ""})
        </summary>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {LEVELS.map((level) => (
              <span key={level} className={`rounded-full border px-2 py-0.5 font-semibold ${badgeClass[level]}`}>
                {level} {summary.counts[level]}
              </span>
            ))}
            <span className={summary.errorsLastHour > 0 ? "font-semibold text-error" : "text-zinc-500"}>
              {summary.errorsLastHour} error{summary.errorsLastHour === 1 ? "" : "s"} in the last hour
            </span>
          </div>

          <form method="GET" action={`/dashboard/apps#tel-${slug}`} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="inspect" value={slug} />
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Level
              <select name="level" defaultValue={filters.level} className={fieldClass}>
                {LEVEL_FILTERS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Period
              <select name="range" defaultValue={filters.range} className={fieldClass}>
                {RANGES.map((r) => (
                  <option key={r} value={r}>
                    Last {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Event type
              <input name="type" defaultValue={filters.type} placeholder="checkout.failed" className={`${fieldClass} w-40 font-mono`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Message contains
              <input name="q" defaultValue={filters.q} maxLength={100} className={`${fieldClass} w-44`} />
            </label>
            <button type="submit" className="rounded-md border-2 border-ink bg-ink px-3 py-1 text-sm font-bold text-paper hover:bg-paper hover:text-ink">
              Apply
            </button>
            <Link href={href(slug, { level: "errors", range: "24h", type: "", q: "" })} className="text-sm underline underline-offset-4">
              Errors, last 24h
            </Link>
          </form>

          {!inspector ? (
            <Link href={href(slug, filters)} className="w-fit text-sm font-semibold underline underline-offset-4">
              Load latest events
            </Link>
          ) : inspector.page.entries.length === 0 ? (
            <p className="text-sm text-zinc-500">No events match these filters.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {inspector.page.entries.map((e) => (
                  <li key={e.id} className="rounded border border-zinc-300 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass[e.level]}`}>{e.level}</span>
                      <code className="break-all text-xs font-semibold">{e.eventType}</code>
                      <span className="text-xs text-zinc-500">
                        {when(e.createdAt)}
                        {e.keyName ? ` · key "${e.keyName}"` : ""}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-zinc-800">{e.message}</p>
                    {e.payload && Object.keys(e.payload).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold text-zinc-600">payload</summary>
                        <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-100 p-2 text-xs">{payloadText(e.payload)}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {inspector.page.nextCursor && (
                <Link href={href(slug, inspector.filters, inspector.page.nextCursor)} className="w-fit text-sm font-semibold underline underline-offset-4">
                  Older events
                </Link>
              )}
            </>
          )}
          <p className="text-xs text-zinc-500">Events are kept for 30 days. Telemetry is best-effort: do not rely on it as an audit trail, and clients must not send personal data or secrets.</p>
        </div>
      </details>
    </section>
  );
}
