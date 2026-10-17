"use client";

import { useActionState } from "react";
import { sendContactMessage, type ContactState } from "@/app/actions/contact";

const initialState: ContactState = { status: "idle" };

const fieldClass =
  "w-full rounded-md border-2 border-ink bg-paper p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

export function ContactForm() {
  const [state, formAction, pending] = useActionState(sendContactMessage, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="flex w-full max-w-md flex-col gap-4">
      {/* Honeypot */}
      <div aria-hidden="true" className="absolute -left-2499.75 h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <label htmlFor="contact-name" className="mb-1 block text-sm font-semibold">
          Your name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          defaultValue={state.values?.name}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          className={fieldClass}
        />
        {errors.name && (
          <p id="contact-name-error" className="mt-1 text-sm text-error">
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-email" className="mb-1 block text-sm font-semibold">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          className={fieldClass}
        />
        {errors.email && (
          <p id="contact-email-error" className="mt-1 text-sm text-error">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1 block text-sm font-semibold">
          How can I help?
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          defaultValue={state.values?.message}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          className={fieldClass}
        />
        {errors.message && (
          <p id="contact-message-error" className="mt-1 text-sm text-error">
            {errors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md border-2 border-ink bg-ink px-6 py-2.5 font-bold text-paper transition-colors duration-300 hover:bg-paper hover:text-ink disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Sending..." : "Get in touch"}
      </button>

      <p role="status" aria-live="polite" className={state.status === "success" ? "text-green-700" : "text-error"}>
        {state.message}
      </p>
    </form>
  );
}
