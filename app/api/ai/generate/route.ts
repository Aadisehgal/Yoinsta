import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAI } from "@/ai/router";
import { PROMPTS, type AIFeature } from "@/ai/prompts";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { feature, topic, keyPoints, provider } = body as {
    feature?: string;
    topic?: string;
    keyPoints?: string;
    provider?: string;
  };

  if (!feature || !(feature in PROMPTS)) {
    return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
  }
  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ error: "topic is required." }, { status: 400 });
  }

  // No ad-gate here on purpose: AI generation runs on the user's own key, so it
  // costs Yoinsta nothing either way. The rewarded-ad gate (lib/ads.ts, AdGate
  // component) is for platform-side analysis — SEO score, keyword research,
  // channel refresh — where a YouTube API quota call is actually spent.

  const buildPrompt = PROMPTS[feature as AIFeature] as (...args: string[]) => string;
  const prompt = buildPrompt(topic, keyPoints ?? "");

  const result = await runAI(session.user.id, prompt, provider);

  await prisma.usageLog.create({
    data: {
      userId: session.user.id,
      action: `ai:${feature}`,
      meta: { success: result.success, provider: result.provider },
    },
  });

  return NextResponse.json(result);
}
