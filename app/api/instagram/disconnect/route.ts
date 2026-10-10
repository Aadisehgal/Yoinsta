import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { instagramCacheKeys } from "@/lib/instagram";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const rows = await prisma.channel.findMany({ where: { userId: session.user.id, platform: "instagram" } });
  await prisma.channel.deleteMany({ where: { userId: session.user.id, platform: "instagram" } });
  for (const row of rows) await redis.del(...instagramCacheKeys(session.user.id, row.platformId)).catch(() => 0);
  await redis.del(...instagramCacheKeys(session.user.id)).catch(() => 0);
  return NextResponse.json({ ok: true });
}
