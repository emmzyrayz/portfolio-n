"use server";

import { revalidatePath } from "next/cache";
import { APP_STATUSES, type AppStatus } from "@/db/schema";
import { createKey, registerApp, revokeKey, setAppStatus } from "@/lib/apps-admin";
import { createKeySchema, idSchema, registerAppSchema } from "@/lib/apps-schemas";
import { verifyOwner } from "@/lib/dal";

export type AppsState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Returned once, right after creation. Never stored, never logged. */
  newKey?: { raw: string; name: string; appSlug: string };
};

function zodErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[issue.path.map(String).join(".")] ??= issue.message;
  return fieldErrors;
}

export async function registerAppAction(_prev: AppsState, formData: FormData): Promise<AppsState> {
  await verifyOwner(); // authorise first

  const parsed = registerAppSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error.issues) };

  const result = await registerApp(parsed.data);
  if (!result.ok) return { status: "error", message: result.message, fieldErrors: result.field ? { [result.field]: result.message } : undefined };

  revalidatePath("/dashboard/apps");
  return { status: "success", message: `Registered "${parsed.data.name}". Create an API key for it below.` };
}

export async function createKeyAction(appId: string, _prev: AppsState, formData: FormData): Promise<AppsState> {
  await verifyOwner();
  if (!idSchema.safeParse(appId).success) return { status: "error", message: "That project no longer exists." };

  const parsed = createKeySchema.safeParse({
    name: String(formData.get("name") ?? ""),
    rateLimitPerMin: String(formData.get("rateLimitPerMin") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error.issues) };

  const result = await createKey(appId, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/dashboard/apps");
  return {
    status: "success",
    message: "Key created. Copy it now: it will not be shown again.",
    newKey: { raw: result.rawKey, name: parsed.data.name, appSlug: result.appSlug },
  };
}

export async function revokeKeyAction(keyId: string): Promise<void> {
  await verifyOwner();
  if (!idSchema.safeParse(keyId).success) return;
  await revokeKey(keyId);
  revalidatePath("/dashboard/apps");
}

export async function setAppStatusAction(appId: string, status: string): Promise<void> {
  await verifyOwner();
  if (!idSchema.safeParse(appId).success || !(APP_STATUSES as readonly string[]).includes(status)) return;
  await setAppStatus(appId, status as AppStatus);
  revalidatePath("/dashboard/apps");
}
