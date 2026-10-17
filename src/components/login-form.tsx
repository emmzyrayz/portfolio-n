"use client";

import { useActionState } from "react";
import { requestOtp, verifyOtp, type AuthState } from "@/app/actions/auth";

const initialState: AuthState = { status: "idle" };

const fieldClass =
  "w-full rounded-md border-2 border-ink bg-paper p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";
const buttonClass =
  "w-fit rounded-md border-2 border-ink bg-ink px-6 py-2.5 font-bold text-paper transition-colors duration-300 hover:bg-paper hover:text-ink disabled:cursor-wait disabled:opacity-60";

export function LoginForm() {
  const [requestState, requestAction, requesting] = useActionState(requestOtp, initialState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyOtp, initialState);

  const email = requestState.status === "sent" ? requestState.email : undefined;

  if (!email) {
    return (
      <form action={requestAction} noValidate className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm font-semibold">
            Email
          </label>
          <input id="login-email" name="email" type="email" autoComplete="email" required className={fieldClass} />
        </div>
        <button type="submit" disabled={requesting} className={buttonClass}>
          {requesting ? "Sending..." : "Email me a code"}
        </button>
        <p role="status" aria-live="polite" className="text-error">
          {requestState.status === "error" ? requestState.message : null}
        </p>
      </form>
    );
  }

  return (
    <form action={verifyAction} noValidate className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <p role="status" aria-live="polite" className="text-sm">
        {requestState.message}
      </p>
      <div>
        <label htmlFor="login-code" className="mb-1 block text-sm font-semibold">
          6-digit code
        </label>
        <input
          id="login-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          className={fieldClass}
        />
      </div>
      <button type="submit" disabled={verifying} className={buttonClass}>
        {verifying ? "Checking..." : "Sign in"}
      </button>
      <p role="alert" className="text-error">
        {verifyState.status === "error" ? verifyState.message : null}
      </p>
    </form>
  );
}
