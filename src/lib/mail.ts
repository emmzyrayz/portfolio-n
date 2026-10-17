import nodemailer from "nodemailer";

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Single entry point for outgoing mail so the SMTP provider can be swapped
 * (ZeptoMail, Resend, ...) without touching callers.
 */
export async function sendMail({ to, subject, text, replyTo }: MailInput) {
  if (!isMailConfigured()) throw new Error("SMTP is not configured");

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transport.sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    text,
    replyTo,
  });
}
