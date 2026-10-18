import { deleteTenantUserAction, revokeUserSessionsAction } from "@/app/actions/tenant-users";
import type { AppDirectory } from "@/lib/tenant-users-admin";
import { ConfirmButton } from "./confirm-button";

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Server component: mutations are bound Server Actions that re-verify the owner session. */
export function UsersDirectory({ appName, directory }: { appName: string; directory: AppDirectory }) {
  const { totalUsers, usersWithSession, activeSessions, users } = directory;

  return (
    <section aria-label={`Users and directory for ${appName}`}>
      <details className="rounded-md border border-zinc-300 p-3">
        <summary className="cursor-pointer text-sm font-bold">Users &amp; Directory ({totalUsers})</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            {totalUsers} registered · {usersWithSession} signed in · {activeSessions} active sessions
            {totalUsers > users.length ? ` · showing the ${users.length} newest` : ""}.
          </p>

          {users.length === 0 ? (
            <p className="text-sm text-zinc-500">No end-users have signed in through the hub yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {users.map((u) => {
                const meta = Object.keys(u.metadata).length > 0 ? JSON.stringify(u.metadata) : null;
                return (
                  <li key={u.id} className="rounded border border-zinc-300 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-all font-semibold">{u.email}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {u.role} · joined {day(u.createdAt)} · {u.activeSessions} active {u.activeSessions === 1 ? "session" : "sessions"}
                      </span>
                    </div>
                    {meta && <p className="mt-1 break-all text-xs text-zinc-600">metadata: {meta}</p>}
                    <div className="mt-2 flex flex-wrap gap-3">
                      {u.activeSessions > 0 && (
                        <form action={revokeUserSessionsAction.bind(null, u.id)}>
                          <ConfirmButton key={`${u.id}-revoke`} label="Revoke sessions" confirmLabel="Confirm: sign out everywhere" />
                        </form>
                      )}
                      <form action={deleteTenantUserAction.bind(null, u.id)}>
                        <ConfirmButton key={`${u.id}-delete`} label="Delete user" confirmLabel="Confirm: delete user" tone="danger" />
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}
