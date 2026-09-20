import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin-log";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { isActive } = await req.json().catch(() => ({}));
  if (typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean." }, { status: 400 });
  }

  await prisma.accessCode.update({ where: { id: params.id }, data: { isActive } });
  await logAdminAction(
    session.user.id,
    isActive ? "ACCESS_CODE_ACTIVATED" : "ACCESS_CODE_DEACTIVATED",
    { codeId: params.id }
  );

  return NextResponse.json({ ok: true });
}
