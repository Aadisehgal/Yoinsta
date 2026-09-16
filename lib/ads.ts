import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const NONCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes to actually watch the ad

/**
 * True if this user can access `resourceKey` right now — either because
 * they're ad-free (redeemed a Master Access Code) or already unlocked this
 * exact resource with a verified ad view.
 */
export async function isUnlocked(userId: string, resourceKey: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { adFree: true } });
  if (user?.adFree) return true;

  const existing = await prisma.adUnlock.findFirst({
    where: { userId, resourceKey, status: "VERIFIED" },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Call when the user clicks "watch ad to unlock". Issues a single-use nonce
 * the client must hand back after the ad's reward callback fires.
 */
export async function startAdUnlock(userId: string, resourceKey: string) {
  const nonce = crypto.randomBytes(16).toString("hex");

  await prisma.adUnlock.create({
    data: {
      userId,
      resourceKey,
      nonce,
      nonceExpiresAt: new Date(Date.now() + NONCE_WINDOW_MS),
    },
  });

  return { nonce };
}

/**
 * Call after the ad SDK reports the reward was earned.
 *
 * IMPORTANT: for a real ad network, this should also verify that network's
 * server-to-server reward postback/signature — trusting only the client's
 * "reward earned" event is spoofable (disable JS, skip the SDK call, etc).
 * The nonce here raises the bar but isn't a substitute for that S2S check.
 * Wire the real network's verification in here once one is chosen.
 */
export async function completeAdUnlock(userId: string, nonce: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const pending = await prisma.adUnlock.findUnique({ where: { nonce } });

  if (!pending || pending.userId !== userId) {
    return { ok: false, error: "Invalid unlock session." };
  }
  if (pending.status === "VERIFIED") {
    return { ok: true }; // already completed, treat as success (idempotent)
  }
  if (pending.nonceExpiresAt < new Date()) {
    return { ok: false, error: "This unlock session expired — try again." };
  }

  await prisma.adUnlock.update({
    where: { id: pending.id },
    data: { status: "VERIFIED", verifiedAt: new Date() },
  });

  return { ok: true };
}
