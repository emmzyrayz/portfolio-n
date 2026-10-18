"use server";

import { revalidatePath } from "next/cache";
import { saveAppConfig } from "@/lib/config-admin";
import { configPayloadSchema } from "@/lib/config-schemas";
import { idSchema } from "@/lib/apps-schemas";
import { verifyOwner } from "@/lib/dal";

export type ConfigState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Keyed by zod path: "2.key", "0.value", or "" for whole-payload errors. */
  fieldErrors?: Record<string, string>;
};

export async function saveConfigAction(appId: string, _prev: ConfigState, formData: FormData): Promise<ConfigState> {
  await verifyOwner(); // authorise first, from the cookie, never from the client
  if (!idSchema.safeParse(appId).success) return { status: "error", message: "That project no longer exists." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { status: "error", message: "Malformed form data. Please reload and try again." };
  }

  const parsed = configPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.map(String).join(".")] ??= issue.message;
    return { status: "error", message: fieldErrors[""] ?? "Please fix the highlighted rows.", fieldErrors };
  }

  try {
    const result = await saveAppConfig(appId, parsed.data);
    if (!result.ok) return { status: "error", message: result.message };
    revalidatePath("/dashboard/apps");
    const note = result.changed + result.removed === 0 ? "No changes." : `Saved (${result.changed} updated, ${result.removed} removed).`;
    return { status: "success", message: `${note} Clients see it within 30 seconds.` };
  } catch (error) {
    console.error("Saving app config failed:", error);
    return { status: "error", message: "Could not save. Please try again." };
  }
}
