import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

export type MailInput = {
  to: string | string[];
  subject: string;
  /** At least one of text / html must be provided. */
  text?: string;
  html?: string;
  replyTo?: string;
  /** Display name for the sender, e.g. a hub tenant's name. The address is always MAIL_FROM. */
  fromName?: string;
};

export type MailResult = { messageId: string };

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * MAIL_DRY_RUN=1 skips the SMTP call and returns a fake id, for tests and staging. It is deliberately
 * ignored on Vercel production so it can never silently swallow real mail there.
 */
export function isDryRun() {
  return process.env.MAIL_DRY_RUN === "1" && process.env.VERCEL_ENV !== "production";
}

/** True when sendMail() can do something (real SMTP, or dry-run). */
export function isMailAvailable() {
  return isDryRun() || isMailConfigured();
}

/** MAIL_FROM may be "addr@x.com" or "Name <addr@x.com>"; the display name comes from the caller. */
function senderAddress() {
  const raw = process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "";
  return raw.match(/<([^>]+)>/)?.[1] ?? raw.trim();
}

/**
 * Single entry point for outgoing mail so the SMTP provider can be swapped
 * (ZeptoMail, Resend, ...) without touching callers.
 */
export async function sendMail({ to, subject, text, html, replyTo, fromName }: MailInput): Promise<MailResult> {
  if (isDryRun()) return { messageId: `dry-run-${randomUUID()}` };
  if (!isMailConfigured()) throw new Error("SMTP is not configured");

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // A stuck SMTP server must not hang a serverless function.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  const info = await transport.sendMail({
    // address object: nodemailer quotes/encodes the name safely (no string concatenation)
    from: fromName ? { name: fromName, address: senderAddress() } : (process.env.MAIL_FROM ?? process.env.SMTP_USER),
    to,
    subject,
    text,
    html,
    replyTo,
  });
  return { messageId: info.messageId };
}
