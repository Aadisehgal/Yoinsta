import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { instagramConfig } from "@/lib/instagram-api";
import { instagramCacheKeys } from "@/lib/instagram";
import { parseSignedRequest } from "@/lib/meta-signed-request";

/** Meta's "data deletion request": remove what we stored for that Instagram account, answer with a status link. */
export async function POST(req: Request) {
  const cfg = instagramConfig();
  const form = await req.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (!cfg || typeof signed !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const payload = parseSignedRequest(signed, cfg.appSecret);
  if (!payload?.user_id) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });

  const igUserId = String(payload.user_id);
  const rows = await prisma.channel.findMany({ where: { platform: "instagram", platformId: igUserId } });
  await prisma.channel.deleteMany({ where: { platform: "instagram", platformId: igUserId } });
  for (const row of rows) await redis.del(...instagramCacheKeys(row.userId, row.platformId)).catch(() => 0);
  await redis.del(`ig:snap:${igUserId}`).catch(() => 0);

  const code = crypto.randomBytes(8).toString("hex");
  return NextResponse.json({
    url: `${process.env.NEXTAUTH_URL}/dashboard/instagram?ig=deleted`,
    confirmation_code: code,
  });
}
