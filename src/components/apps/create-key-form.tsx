"use client";

import { useActionState, useState } from "react";
import { createKeyAction, type AppsState } from "@/app/actions/apps";
import { TextField, buttonClass } from "@/components/dashboard/editor-ui";

const initialState: AppsState = { status: "idle" };

export function CreateKeyForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState(createKeyAction.bind(null, appId), initialState);
  const errors = state.fieldErrors ?? {};

  const [name, setName] = useState("");
  const [limit, setLimit] = useState("60");
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const newKey = state.newKey && state.newKey.raw !== dismissed ? state.newKey : null;

  async function copy(raw: string) {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
    } catch {
      // clipboard can be blocked; the key stays selectable in the box below
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {newKey && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border-2 border-ink bg-zinc-100 p-3">
          <p className="text-sm font-bold">
            New key &ldquo;{newKey.name}&rdquo; for <code>{newKey.appSlug}</code>: copy it now, it is shown only once.
          </p>
          <code className="break-all rounded bg-paper p-2 text-sm select-all" data-testid="new-api-key">
            {newKey.raw}
          </code>
          <p className="text-xs text-zinc-600">
            Send it as <code>Authorization: Bearer ...</code> together with <code>x-app-id: {newKey.appSlug}</code>. We only store a hash, so a lost
            key cannot be recovered: create a new one instead.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => copy(newKey.raw)} className="rounded-md border-2 border-ink px-3 py-1 text-sm font-semibold hover:bg-ink hover:text-paper">
              {copied ? "Copied" : "Copy key"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissed(newKey.raw);
                setCopied(false);
              }}
              className="rounded-md border-2 border-ink px-3 py-1 text-sm font-semibold hover:bg-ink hover:text-paper"
            >
              I&apos;ve stored it
            </button>
          </div>
        </div>
      )}

      <form action={action} onSubmit={() => setCopied(false)} className="flex flex-col gap-3 rounded-md border border-zinc-300 p-3">
        <h4 className="text-sm font-bold">Create an API key</h4>
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="rateLimitPerMin" value={limit} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id={`key-name-${appId}`} label="Key name" value={name} onChange={setName} error={errors.name} placeholder="production" />
          <TextField id={`key-limit-${appId}`} label="Requests per minute" type="number" value={limit} onChange={setLimit} error={errors.rateLimitPerMin} />
        </div>
        <button type="submit" disabled={pending} className={`${buttonClass} !px-4 !py-1.5 text-sm`}>
          {pending ? "Creating..." : "Create key"}
        </button>
        {state.status === "error" && <p role="status" className="text-sm text-error">{state.message}</p>}
      </form>
    </div>
  );
}
