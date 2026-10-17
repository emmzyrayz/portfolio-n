"use client";

import { useState, type ReactNode } from "react";
import type { ContentState } from "@/app/actions/content";

export const fieldClass =
  "w-full rounded-md border-2 border-ink bg-paper p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";
export const buttonClass =
  "w-fit rounded-md border-2 border-ink bg-ink px-6 py-2.5 font-bold text-paper transition-colors duration-300 hover:bg-paper hover:text-ink disabled:cursor-wait disabled:opacity-60";
export const smallButtonClass =
  "rounded-md border-2 border-ink px-3 py-1 text-sm font-semibold transition-colors duration-300 hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40";

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
};

export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "email" | "number";
  multiline?: boolean;
  placeholder?: string;
};

export function TextField({ id, label, value, onChange, error, type = "text", multiline, placeholder }: TextFieldProps) {
  const shared = {
    id,
    value,
    placeholder,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
    className: fieldClass,
  };
  return (
    <Field id={id} label={label} error={error}>
      {multiline ? (
        <textarea {...shared} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type={type} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

/** Row list state with add / remove / reorder; order in the array is the saved position. */
export function useList<T>(initial: T[]) {
  const [rows, setRows] = useState<T[]>(initial);
  return {
    rows,
    update: (index: number, patch: Partial<T>) =>
      setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row))),
    add: (row: T) => setRows((r) => [...r, row]),
    remove: (index: number) => setRows((r) => r.filter((_, i) => i !== index)),
    move: (index: number, delta: -1 | 1) =>
      setRows((r) => {
        const target = index + delta;
        if (target < 0 || target >= r.length) return r;
        const next = [...r];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
  };
}

type RowShellProps = {
  title: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
};

export function RowShell({ title, index, count, onMove, onRemove, children }: RowShellProps) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border-2 border-zinc-300 p-4">
      <legend className="px-1 text-sm font-bold">
        {title} {index + 1}
      </legend>
      {children}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={smallButtonClass}>
          Move up
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className={smallButtonClass}>
          Move down
        </button>
        <button type="button" onClick={onRemove} className={smallButtonClass}>
          Remove
        </button>
      </div>
    </fieldset>
  );
}

type SaveBarProps = { pending: boolean; state: ContentState };

export function SaveBar({ pending, state }: SaveBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving..." : "Save changes"}
      </button>
      <p role="status" aria-live="polite" className={state.status === "success" ? "text-green-700" : "text-error"}>
        {state.message}
      </p>
    </div>
  );
}
