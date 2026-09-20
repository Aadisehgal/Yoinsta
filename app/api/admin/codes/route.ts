import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAccessCode } from "@/lib/access-code";
import { logAdminAction } from "@/lib/admin-log";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      isActive: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ codes });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { maxUses, expiresInDays } = await req.json().catch(() => ({}));

  const { plainCode, record } = await createAccessCode(session.user.id, {
    maxUses: typeof maxUses === "number" ? maxUses : undefined,
    expiresInDays: typeof expiresInDays === "number" ? expiresInDays : undefined,
  });

  await logAdminAction(session.user.id, "ACCESS_CODE_CREATED", { codeId: record.id, maxUses: record.maxUses });

  // The only time the plain code is ever returned — only the hash is stored.
  return NextResponse.json({
    code: plainCode,
    id: record.id,
    maxUses: record.maxUses,
    expiresAt: record.expiresAt,
  });
}
