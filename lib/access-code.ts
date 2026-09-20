import crypto from "crypto";
import { sha256Hash } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

// No ambiguous chars (I/1, O/0) — codes get typed by hand.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateReadableCode(): string {
  const segment = () =>
    Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
  return `YOIN-${segment()}-${segment()}`;
}

/** Only the hash is ever stored — the plain code is returned once, here, and nowhere else. */
export async function createAccessCode(
  createdBy: string,
  opts: { maxUses?: number; expiresInDays?: number } = {}
) {
  const plainCode = generateReadableCode();
  const codeHash = sha256Hash(plainCode);
  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const record = await prisma.accessCode.create({
    data: { codeHash, maxUses: opts.maxUses ?? 10, expiresAt, createdBy },
  });

  return { plainCode, record };
}

export async function redeemAccessCode(
  userId: string,
  rawCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const codeHash = sha256Hash(rawCode.trim().toUpperCase());

  const code = await prisma.accessCode.findUnique({ where: { codeHash } });
  if (!code || !code.isActive) return { ok: false, error: "Invalid or inactive code." };
  if (code.expiresAt && code.expiresAt < new Date()) return { ok: false, error: "This code has expired." };
  if (code.usedCount >= code.maxUses) return { ok: false, error: "This code has reached its usage limit." };

  const already = await prisma.codeRedemption.findUnique({
    where: { codeId_userId: { codeId: code.id, userId } },
  });
  if (already) return { ok: false, error: "You've already redeemed this code." };

  await prisma.$transaction([
    prisma.codeRedemption.create({ data: { codeId: code.id, userId } }),
    prisma.accessCode.update({ where: { id: code.id }, data: { usedCount: { increment: 1 } } }),
    prisma.user.update({ where: { id: userId }, data: { adFree: true } }),
  ]);

  return { ok: true };
}
