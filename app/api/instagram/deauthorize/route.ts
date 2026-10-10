import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { instagramConfig } from "@/lib/instagram-api";
import { instagramCacheKeys } from "@/lib/instagram";
import { parseSignedRequest } from "@/lib/meta-signed-request";

/** Called by Meta when someone removes Yoinsta from their Instagram's "Apps and websites". */
export async function POST(req: Request) {
  const cfg = instagramConfig();
  const form = await req.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (!cfg || typeof signed !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const payload = parseSignedRequest(signed, cfg.appSecret);
  if (!payload?.user_id) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });

  const rows = await prisma.channel.findMany({ where: { platform: "instagram", platformId: String(payload.user_id) } });
  await prisma.channel.deleteMany({ where: { platform: "instagram", platformId: String(payload.user_id) } });
  for (const row of rows) await redis.del(...instagramCacheKeys(row.userId, row.platformId)).catch(() => 0);
  return NextResponse.json({ ok: true });
}
