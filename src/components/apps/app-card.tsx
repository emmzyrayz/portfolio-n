import { revokeKeyAction, setAppStatusAction } from "@/app/actions/apps";
import type { AdminApp } from "@/lib/apps-admin";
import { ConfigEditor } from "./config-editor";
import { ConfirmButton } from "./confirm-button";
import { MailLogs } from "./mail-logs";
import { TelemetryInspector, type InspectorState } from "./telemetry-inspector";
import { CreateKeyForm } from "./create-key-form";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

const statusLabel = { active: "Active", handed_over: "Handed over", archived: "Archived" } as const;

function StatusBadge({ status }: { status: AdminApp["status"] }) {
  const cls = status === "active" ? "border-ink text-ink" : "border-zinc-400 text-zinc-500";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{statusLabel[status]}</span>;
}

/** Server component: all mutations are bound Server Actions that re-verify the owner session. */
export function AppCard({ app, inspector }: { app: AdminApp; inspector?: InspectorState }) {
  const activeKeys = app.keys.filter((k) => !k.revokedAt);

  return (
    <article className="flex flex-col gap-4 rounded-lg border-2 border-ink p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{app.name}</h2>
          <p className="text-sm text-zinc-600">
            x-app-id: <code className="rounded bg-zinc-100 px-1.5 py-0.5">{app.slug}</code>
          </p>
        </div>
        <StatusBadge status={app.status} />
      </header>

      <section aria-label={`API keys for ${app.name}`}>
        <h3 className="mb-1 text-sm font-bold">API keys ({activeKeys.length} active)</h3>
        {app.keys.length === 0 ? (
          <p className="text-sm text-zinc-500">No keys yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {app.keys.map((k) => (
              <li key={k.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-300 px-3 py-2 text-sm ${k.revokedAt ? "opacity-60" : ""}`}>
                <span>
                  <b>{k.name}</b> <code className="text-zinc-600">{k.prefix}...</code>
                  <span className="ml-2 text-xs text-zinc-500">
                    {k.rateLimitPerMin}/min · created {date(k.createdAt)} · last used {date(k.lastUsedAt)}
                  </span>
                </span>
                {k.revokedAt ? (
                  <span className="text-xs font-semibold text-error">Revoked {date(k.revokedAt)}</span>
                ) : (
                  <form action={revokeKeyAction.bind(null, k.id)}>
                    <ConfirmButton key={`${k.id}-revoke`} label="Revoke" confirmLabel="Confirm revoke" tone="danger" />
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={`Config and flags for ${app.name}`}>
        <details className="rounded-md border border-zinc-300 p-3">
          <summary className="cursor-pointer text-sm font-bold">Config &amp; flags ({app.config.length})</summary>
          <div className="mt-3">
            {app.status === "active" ? (
              <ConfigEditor appId={app.id} slug={app.slug} initial={app.config.map((c) => ({ key: c.key, value: c.value }))} />
            ) : (
              <p className="text-sm text-zinc-500">Read-only while this project is {statusLabel[app.status].toLowerCase()}: {app.config.length} saved keys. Reactivate it to edit.</p>
            )}
          </div>
        </details>
      </section>

      <MailLogs appName={app.name} mail={app.mail} />

      <TelemetryInspector slug={app.slug} name={app.name} summary={app.telemetry} inspector={inspector} />

      {app.status === "active" ? (
        <CreateKeyForm appId={app.id} />
      ) : (
        <p className="text-sm text-zinc-500">
          This project is {statusLabel[app.status].toLowerCase()} since {date(app.statusChangedAt)}: all its keys were revoked and the hub rejects it.
          Reactivate it to issue new keys.
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3">
        {app.status === "active" ? (
          <>
            <form action={setAppStatusAction.bind(null, app.id, "handed_over")}>
              <ConfirmButton key={`${app.id}-${app.status}-handover`} label="Mark handed over" confirmLabel="Confirm: revoke keys & hand over" />
            </form>
            <form action={setAppStatusAction.bind(null, app.id, "archived")}>
              <ConfirmButton key={`${app.id}-${app.status}-archive`} label="Archive" confirmLabel="Confirm: revoke keys & archive" />
            </form>
          </>
        ) : (
          <form action={setAppStatusAction.bind(null, app.id, "active")}>
            <ConfirmButton key={`${app.id}-${app.status}-reactivate`} label="Reactivate" confirmLabel="Confirm reactivate (new keys needed)" />
          </form>
        )}
        <p className="text-xs text-zinc-500">Handing over or archiving revokes every key at once.</p>
      </footer>
    </article>
  );
}
