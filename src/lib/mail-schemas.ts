import { z } from "zod";

// Pure (no I/O, no server-only): used by the hub endpoint and unit tests.

export const MAX_RECIPIENTS = 5;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_BYTES = 100 * 1024;
export const MAX_REQUEST_BYTES = 256 * 1024;

/** No CR, LF or NUL anywhere: the classic SMTP header-injection vectors. */
const noControl = /^[^\r\n\0]*$/;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(noControl)
  .pipe(z.email());

const body = z.string().max(MAX_BODY_BYTES);

export const mailSendSchema = z
  .strictObject({
    /** One address or up to 5. Each recipient gets their own message, so they never see each other. */
    to: z.union([email, z.array(email).min(1).max(MAX_RECIPIENTS)]).transform((v) => [...new Set(Array.isArray(v) ? v : [v])]),
    subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH).regex(noControl),
    text: body.optional(),
    html: body.optional(),
    replyTo: email.optional(),
  })
  .refine((v) => Boolean(v.text?.trim() || v.html?.trim()), { path: ["text"], message: "text or html is required" });

export type MailSendInput = z.infer<typeof mailSendSchema>;

/**
 * Names of the failing fields only: never the submitted values and never internal messages, so a
 * validation error cannot be used to probe the server. Whole-body problems report "body".
 */
export function invalidFields(issues: { path: PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((i) => (typeof i.path[0] === "string" ? i.path[0] : "body")))];
}
