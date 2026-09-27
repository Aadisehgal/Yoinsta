import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { runAI } from "@/ai/router";
import { personalizedIdeasPrompt, trendingIdeasPrompt } from "@/ai/prompts";
import { buildChannelContext } from "@/ai/channel-context";
import { getUserAccessToken, getAutocompleteSuggestions } from "@/lib/youtube";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { mode, topic, provider } = await req.json().catch(() => ({}));

  if (mode === "personalized") {
    const accessToken = await getUserAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
    }

    try {
      // Same cache key the Channel Audit chat uses — warm for one if the other already ran.
      const context = await cached(`ai:channel-context:${session.user.id}`, 15 * 60, () =>
        buildChannelContext(accessToken)
      );
      const result = await runAI(session.user.id, personalizedIdeasPrompt(context), provider);
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({ error: "Couldn't load your channel data right now." }, { status: 502 });
    }
  }

  if (mode === "trending") {
    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ error: "topic is required for trending ideas." }, { status: 400 });
    }
    const suggestions = await getAutocompleteSuggestions(topic).catch(() => []);
    const result = await runAI(session.user.id, trendingIdeasPrompt(topic, suggestions), provider);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "mode must be 'personalized' or 'trending'." }, { status: 400 });
}
