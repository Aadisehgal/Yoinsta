import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { runChat } from "@/ai/router";
import { buildChannelContext } from "@/ai/channel-context";
import { getUserAccessToken } from "@/lib/youtube";
import type { ChatMessage } from "@/ai/types";

function buildSystemPrompt(context: string): string {
  return [
    "You are Yoinsta's YouTube growth coach. You have REAL data for this creator's channel below —",
    "always ground your answers in it (cite specific video titles, view counts, or numbers).",
    "Never give generic advice when specific data is available. If something can't be answered from",
    "this data, say so plainly instead of guessing.",
    "",
    "CHANNEL DATA:",
    context,
    "",
    "When diagnosing things like \"why are my views low\", look for real patterns: inconsistent",
    "upload schedule, view counts low relative to subscriber count, weak-performing recent uploads,",
    "outlier videos that did much better/worse than the rest. Keep answers concise and actionable.",
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

    const result = await runChat(session.user.id, buildSystemPrompt(context), messages as ChatMessage[], provider);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Couldn't load your channel data right now." }, { status: 502 });
  }
}
