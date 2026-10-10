import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { runChat } from "@/ai/router";
import { buildChannelContext } from "@/ai/channel-context";
import { getUserAccessToken } from "@/lib/youtube";
import { getCompetitorContext } from "@/lib/competitors";
import { getInstagramContext } from "@/lib/instagram";
import type { ChatMessage } from "@/ai/types";

// Chat prompts carry the whole channel context — give the function room to finish (Vercel Hobby max is 60s).
export const maxDuration = 60;

function buildSystemPrompt(context: string, competitors: string, instagram: string): string {
  return [
    "You are Yoinsta's YouTube growth coach. You have REAL data for this creator's channel below —",
    "always ground your answers in it (cite specific video titles, view counts, or numbers).",
    "Never give generic advice when specific data is available. If something can't be answered from",
    "this data, say so plainly instead of guessing.",
    "",
    "CHANNEL DATA:",
    context,
    "",
    ...(instagram
      ? [
          "INSTAGRAM DATA (the creator's connected Instagram account):",
          instagram,
          "When asked about Instagram, use these exact numbers and captions. Instagram allows at most 5 hashtags per",
          "post — never recommend more. If a number isn't listed, say it isn't available.",
          "",
        ]
      : []),
    ...(competitors
      ? [
          "COMPETITOR DATA (channels the creator tracks; public stats only):",
          competitors,
          "When the creator asks about competitors, compare THEIR numbers with the creator's own above, cite exact",
          "figures and video titles, and point to what is repeatable. Never invent competitor numbers; if a",
          "number isn't listed, say it isn't available.",
          "",
        ]
      : []),
    "When diagnosing things like \"why are my views low\", look for real patterns: inconsistent",
    "upload schedule, view counts low relative to subscriber count, weak-performing recent uploads,",
    "outlier videos that did much better/worse than the rest. Keep answers concise and actionable.",
    "",
    "LANGUAGE: Always answer in the language and script the creator writes in. If they write Hinglish",
    "(Hindi in English letters), answer in simple Hinglish with short sentences. Never switch to English",
    "just because these instructions are in English.",
    "",
    "LIMITS: In this chat you only see numbers and titles, never the video footage itself. If the creator",
    "asks you to watch or review a video scene by scene, say so in one sentence and tell them to open",
    "Videos \u2192 pick the video \u2192 \"Scene-by-scene review\" (it must be Public and needs a Gemini key).",
    "Meanwhile still give the best advice you can from the data, clearly labelled as based on stats only.",
  ].join("\n");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { messages, provider } = await req.json().catch(() => ({}));
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required." }, { status: 400 });
  }

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const context = await cached(`ai:channel-context:${session.user.id}`, 15 * 60, () =>
      buildChannelContext(accessToken)
    );

    // Competitor numbers are optional extras — if they can't be read, the chat still answers from the channel data.
    const competitors = await getCompetitorContext(session.user.id, accessToken);
    const instagram = await getInstagramContext(session.user.id);

    const result = await runChat(session.user.id, buildSystemPrompt(context, competitors, instagram), messages as ChatMessage[], provider);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Couldn't load your channel data right now." }, { status: 502 });
  }
}
