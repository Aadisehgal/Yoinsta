import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateImage } from "@/ai/image-router";

const THUMBNAIL_STYLE_SUFFIX = " Bold, high-contrast YouTube thumbnail style: one clear focal subject, dramatic lighting, punchy saturated colors, readable at small size, no watermarks.";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { prompt, provider } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  const result = await generateImage(session.user.id, prompt + THUMBNAIL_STYLE_SUFFIX, provider);
  return NextResponse.json(result);
}
