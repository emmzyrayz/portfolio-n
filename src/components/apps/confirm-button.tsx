"use client";

import { useState } from "react";

const base = "rounded-md border-2 px-3 py-1 text-sm font-semibold transition-colors duration-300";
const tones = {
  default: { idle: "border-ink hover:bg-ink hover:text-paper", confirm: "border-ink bg-ink text-paper hover:bg-paper hover:text-ink" },
  danger: { idle: "border-error text-error hover:bg-error hover:text-paper", confirm: "border-error bg-error text-paper hover:bg-paper hover:text-error" },
};

/**
 * Two-step submit for destructive actions without window.confirm(): the first click arms the button,
 * the second click submits the surrounding <form>. Remount it (via `key`) after the action completes.
 */
export function ConfirmButton({ label, confirmLabel, tone = "default" }: { label: string; confirmLabel: string; tone?: "default" | "danger" }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={`${base} ${tones[tone].idle}`}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="submit" className={`${base} ${tones[tone].confirm}`}>
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-sm underline underline-offset-4">
        Cancel
      </button>
    </span>
  );
}
