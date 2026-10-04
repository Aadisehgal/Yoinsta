import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { runChat } from "@/ai/router";
import { buildChannelContext } from "@/ai/channel-context";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { loadIntelligence } from "@/lib/competitors";
import { formatCompetitorContext } from "@/lib/competitor-metrics";
import { REPORT_SYSTEM_PROMPT, buildReportPrompt, normalizeReport } from "@/lib/competitor-report";
import { extractJsonObject, type Lang } from "@/lib/video-analysis";
import { getUserAccessToken } from "@/lib/youtube";

// Reading the channels + one long AI answer: use the full minute Vercel Hobby allows.
export const maxDuration = 60;

const DAILY_LIMIT = 20;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { lang?: unknown };
  const lang: Lang = body.lang === "english" ? "english" : "hinglish";

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const intel = await loadIntelligence(session.user.id, accessToken);
    if (intel.competitors.length === 0) {
      return NextResponse.json({ error: "Add at least one competitor first, then run the report." }, { status: 400 });
    }

    const quota = await checkAndConsumeQuota(session.user.id, "ai_competitor_report", DAILY_LIMIT);
    if (!quota.allowed) {
      return NextResponse.json({ error: `Daily competitor-report limit reached (${DAILY_LIMIT}). Try again tomorrow.` }, { status: 429 });
    }

    const ownContext = await cached(`ai:channel-context:${session.user.id}`, 15 * 60, () =>
      buildChannelContext(accessToken)
    ).catch(() => "");

    const prompt = buildReportPrompt({ competitorContext: formatCompetitorContext(intel), ownContext, lang });
    const result = await runChat(session.user.id, REPORT_SYSTEM_PROMPT, [{ role: "user", content: prompt }]);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "The AI request failed." }, { status: 502 });
    }

    const parsed = extractJsonObject(result.content);
    return NextResponse.json({
      report: parsed ? normalizeReport(parsed) : null,
      // If the model didn't return usable JSON, show its words instead of nothing.
      raw: parsed ? undefined : result.content.slice(0, 5000),
      provider: result.provider,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't build the competitor report right now." }, { status: 502 });
  }
}
