import { prisma } from "@/lib/prisma";

/** Call this from EVERY admin route that changes state (code, plan grants, etc). */
export async function logAdminAction(
  actorId: string,
  action: string,
  meta?: Record<string, unknown>
) {
  await prisma.adminLog.create({
    data: { actorId, action, meta: meta ?? undefined },
  });
}
