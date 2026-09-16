import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  await prisma.channel.deleteMany({ where: { userId: session.user.id, platform: "youtube" } });
  await redis.del(`yt:dashboard:${session.user.id}`, `yt:videos:${session.user.id}`);

  return NextResponse.json({ ok: true });
}
