import type { AppMail } from "@/lib/mail-admin";
import { HOURLY_LIMIT_PER_TENANT } from "@/lib/mail-hub";

const when = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Read-only activity view for one tenant. Server component: no client code, no actions to replay. */
export function MailLogs({ appName, mail }: { appName: string; mail: AppMail }) {
  const { recent, usedThisHour, windowEndsAt } = mail;
  const nearLimit = usedThisHour >= HOURLY_LIMIT_PER_TENANT * 0.8;

  return (
    <section aria-label={`Mail logs for ${appName}`}>
      <details className="rounded-md border border-zinc-300 p-3">
        <summary className="cursor-pointer text-sm font-bold">Mail logs ({recent.length} recent)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className={`text-sm ${nearLimit ? "font-semibold text-error" : "text-zinc-600"}`}>
            {usedThisHour} of {HOURLY_LIMIT_PER_TENANT} recipients used this hour
            {windowEndsAt ? ` (window resets about ${time(windowEndsAt)})` : ""}. Failed attempts count too. Message bodies are never stored.
          </p>

          {recent.length === 0 ? (
            <p className="text-sm text-zinc-500">No emails sent through the hub by this project yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((m) => (
                <li key={m.id} className="rounded border border-zinc-300 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-all font-semibold">{m.recipient}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${m.status === "sent" ? "border-ink text-ink" : "border-error text-error"}`}
                    >
                      {m.status === "sent" ? "Sent" : "Failed"}
                    </span>
                  </div>
                  <p className="break-words text-zinc-700">{m.subject}</p>
                  <p className="text-xs text-zinc-500">
                    {when(m.createdAt)}
                    {m.keyName ? ` · key "${m.keyName}"` : ""}
                    {m.errorMessage ? ` · ${m.errorMessage}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}
