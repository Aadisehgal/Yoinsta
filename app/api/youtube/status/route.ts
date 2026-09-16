import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const channel = await prisma.channel.findFirst({
    where: { userId: session.user.id, platform: "youtube" },
    select: { title: true, thumbnail: true, connectedAt: true },
  });

  return NextResponse.json({ connected: Boolean(channel), channel });
}
