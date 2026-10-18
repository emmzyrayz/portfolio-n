"use client";

import { useActionState, useState } from "react";
import { registerAppAction, type AppsState } from "@/app/actions/apps";
import { TextField, buttonClass } from "@/components/dashboard/editor-ui";

const initialState: AppsState = { status: "idle" };

export function RegisterAppForm() {
  const [state, action, pending] = useActionState(registerAppAction, initialState);
  const errors = state.fieldErrors ?? {};

  // Controlled so values survive a failed attempt (React resets uncontrolled forms after an action).
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  return (
    <form
      action={action}
      className="flex max-w-xl flex-col gap-4 rounded-lg border-2 border-zinc-300 p-4"
    >
      <h2 className="text-lg font-bold">Register a client project</h2>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="slug" value={slug} />
      <TextField id="app-name" label="Client / project name" value={name} onChange={setName} error={errors.name} />
      <div>
        <TextField
          id="app-slug"
          label="Identifier (sent as the x-app-id header)"
          value={slug}
          onChange={(v) => setSlug(v.toLowerCase())}
          error={errors.slug}
          placeholder="acme-store"
        />
        <p className="mt-1 text-xs text-zinc-500">Lowercase letters, numbers and hyphens. It cannot be changed later, because clients depend on it.</p>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Registering..." : "Register project"}
      </button>
      <p role="status" aria-live="polite" className={state.status === "success" ? "text-green-700" : "text-error"}>
        {state.message}
      </p>
    </form>
  );
}
