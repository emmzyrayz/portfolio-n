"use server";

import { revalidatePath } from "next/cache";
import { idSchema } from "@/lib/apps-schemas";
import { verifyOwner } from "@/lib/dal";
import { deleteTenantUser, revokeUserSessions } from "@/lib/tenant-users-admin";

export async function revokeUserSessionsAction(userId: string): Promise<void> {
  await verifyOwner(); // authorise first
  if (!idSchema.safeParse(userId).success) return;
  await revokeUserSessions(userId);
  revalidatePath("/dashboard/apps");
}

export async function deleteTenantUserAction(userId: string): Promise<void> {
  await verifyOwner();
  if (!idSchema.safeParse(userId).success) return;
  await deleteTenantUser(userId);
  revalidatePath("/dashboard/apps");
}
