"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { isMailConfigured, sendMail } from "@/lib/mail";

export type ContactState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "message", string>>;
  /** Echoed back so the form keeps what the visitor typed after an error. */
  values?: { name: string; email: string; message: string };
};

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(100, "Name is too long.").regex(/^[^\r\n]*$/, "Invalid name."),
  email: z.email("Please enter a valid email address.").max(200),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(5000, "Message is too long."),
});

// Best-effort limiter: in-memory, so per server instance only.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 3;

function rateLimited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_HITS;
}

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // Honeypot: real visitors never see or fill this field.
  if (formData.get("website")) return { status: "success", message: "Thanks! Your message has been sent." };

  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    message: String(formData.get("message") ?? ""),
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: NonNullable<ContactState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof typeof fieldErrors;
      fieldErrors[key] ??= issue.message;
    }
    return { status: "error", fieldErrors, values: raw };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return { status: "error", message: "Too many messages. Please try again in a few minutes.", values: raw };
  }

  if (!isMailConfigured()) {
    return { status: "error", message: "The contact form isn't set up yet. Please email me directly.", values: raw };
  }

  const { name, email, message } = parsed.data;
  try {
    await sendMail({
      to: process.env.OWNER_EMAIL ?? process.env.SMTP_USER!,
      subject: `Portfolio message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      replyTo: email,
    });
  } catch (error) {
    console.error("Contact form send failed:", error);
    return { status: "error", message: "Something went wrong sending your message. Please try again later.", values: raw };
  }

  return { status: "success", message: "Thanks! Your message has been sent." };
}
