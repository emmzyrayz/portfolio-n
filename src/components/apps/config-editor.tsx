"use client";

import { useActionState, useState } from "react";
import { saveConfigAction, type ConfigState } from "@/app/actions/config";
import { SaveBar, fieldClass, smallButtonClass } from "@/components/dashboard/editor-ui";
import type { ConfigEntry } from "@/lib/config-schemas";

const initialState: ConfigState = { status: "idle" };

type Row = { id: number; key: string; text: string };

const toText = (value: unknown) => (value !== null && typeof value === "object" ? JSON.stringify(value, null, 2) : JSON.stringify(value));

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function ConfigEditor({ appId, slug, initial }: { appId: string; slug: string; initial: ConfigEntry[] }) {
  const [state, action, pending] = useActionState(saveConfigAction.bind(null, appId), initialState);
  const errors = state.fieldErrors ?? {};

  const [rows, setRows] = useState<Row[]>(() => initial.map((e, i) => ({ id: i, key: e.key, text: toText(e.value) })));
  const [nextId, setNextId] = useState(initial.length);

  const parsed = rows.map((r) => parse(r.text));
  const allValid = parsed.every((p) => p.ok);
  const payload = JSON.stringify(rows.map((r, i) => ({ key: r.key, value: parsed[i].ok ? (parsed[i] as { ok: true; value: unknown }).value : null })));

  const update = (id: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (key: string, text: string) => {
    setRows((all) => [...all, { id: nextId, key, text }]);
    setNextId((n) => n + 1);
  };

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="payload" value={payload} />
      <p className="text-xs text-zinc-600">
        Read by <code>GET /api/hub/v1/config</code> with <code>x-app-id: {slug}</code>. Anyone holding this project&apos;s key can read these values, so{" "}
        <b>never store secrets here</b>. Clients see changes within about 30 seconds.
      </p>

      {rows.length === 0 && <p className="text-sm text-zinc-500">No config yet. Add a flag or a value.</p>}

      {rows.map((row, i) => {
        const p = parsed[i];
        const isBool = p.ok && typeof p.value === "boolean";
        const keyError = errors[`${i}.key`];
        const valueError = errors[`${i}.value`] ?? (p.ok ? undefined : "Not valid JSON (strings need quotes).");
        return (
          <div key={row.id} className="flex flex-col gap-2 rounded-md border border-zinc-300 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
              <div>
                <label htmlFor={`cfg-key-${appId}-${row.id}`} className="mb-1 block text-xs font-semibold">
                  Key
                </label>
                <input
                  id={`cfg-key-${appId}-${row.id}`}
                  value={row.key}
                  onChange={(e) => update(row.id, { key: e.target.value })}
                  placeholder="flags.new_checkout"
                  aria-invalid={Boolean(keyError)}
                  className={`${fieldClass} font-mono text-sm`}
                />
                {keyError && <p className="mt-1 text-xs text-error">{keyError}</p>}
              </div>
              <div>
                <label htmlFor={`cfg-val-${appId}-${row.id}`} className="mb-1 block text-xs font-semibold">
                  Value (JSON)
                </label>
                {isBool ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.value === true}
                    id={`cfg-val-${appId}-${row.id}`}
                    onClick={() => update(row.id, { text: p.value === true ? "false" : "true" })}
                    className={`rounded-md border-2 border-ink px-4 py-2 text-sm font-bold ${p.value === true ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                  >
                    {p.value === true ? "ON (true)" : "OFF (false)"}
                  </button>
                ) : (
                  <textarea
                    id={`cfg-val-${appId}-${row.id}`}
                    value={row.text}
                    onChange={(e) => update(row.id, { text: e.target.value })}
                    rows={Math.min(8, Math.max(1, row.text.split("\n").length))}
                    aria-invalid={Boolean(valueError)}
                    className={`${fieldClass} font-mono text-sm`}
                  />
                )}
                {valueError && <p className="mt-1 text-xs text-error">{valueError}</p>}
              </div>
              <div className="sm:pt-5">
                <button type="button" onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))} className={smallButtonClass}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {errors[""] && <p className="text-sm text-error">{errors[""]}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add("flags.", "false")} className={smallButtonClass}>
          Add flag (on/off)
        </button>
        <button type="button" onClick={() => add("", '""')} className={smallButtonClass}>
          Add value
        </button>
      </div>

      <SaveBar pending={pending} disabled={!allValid} state={state} />
      {!allValid && <p className="text-xs text-error">Fix the invalid JSON above to enable Save.</p>}

      <p className="text-xs text-zinc-500">
        Test it: <code>curl -H &quot;x-app-id: {slug}&quot; -H &quot;Authorization: Bearer &lt;your key&gt;&quot; &lt;your-domain&gt;/api/hub/v1/config</code>
      </p>
    </form>
  );
}
