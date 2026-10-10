import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { runChat } from "@/ai/router";
import { buildChannelContext } from "@/ai/channel-context";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { describeInstagramFailure } from "@/lib/instagram-api";
import { loadInstagramOverview } from "@/lib/instagram";
import { formatInstagramContext } from "@/lib/instagram-metrics";
import { IG_REPORT_SYSTEM_PROMPT, buildIgReportPrompt, normalizeIgReport } from "@/lib/instagram-copy";
import { extractJsonObject, type Lang } from "@/lib/video-analysis";
import { getUserAccessToken } from "@/lib/youtube";

export const maxDuration = 60;

const DAILY_LIMIT = 20;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { lang?: unknown; tz?: unknown };
  const lang: Lang = body.lang === "english" ? "english" : "hinglish";
  const tzRaw = Number(body.tz ?? 0);
  const tz = Number.isInteger(tzRaw) && Math.abs(tzRaw) <= 14 * 60 ? tzRaw : 0;

  try {
    const overview = await loadInstagramOverview(session.user.id, tz);
    if (!overview) return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
    if (overview.posts.length < 3) {
      return NextResponse.json({ error: "Post a few more times first — the report needs at least 3 posts to say anything useful." }, { status: 400 });
    }

    const quota = await checkAndConsumeQuota(session.user.id, "ai_instagram_report", DAILY_LIMIT);
    if (!quota.allowed) {
      return NextResponse.json({ error: `Daily report limit reached (${DAILY_LIMIT}). Try again tomorrow.` }, { status: 429 });
    }

    // The creator's YouTube channel is optional context (their niche).
    const ytToken = await getUserAccessToken(session.user.id).catch(() => null);
    const youtubeContext = ytToken
      ? await cached(`ai:channel-context:${session.user.id}`, 15 * 60, () => buildChannelContext(ytToken)).catch(() => "")
      : "";

    const context = formatInstagramContext(overview.profile, overview.account, overview.posts, overview.summary, overview.followerGrowth);
    const prompt = buildIgReportPrompt({ context, youtubeContext, lang });
    const result = await runChat(session.user.id, IG_REPORT_SYSTEM_PROMPT, [{ role: "user", content: prompt }]);
    if (!result.success) return NextResponse.json({ error: result.error ?? "The AI request failed." }, { status: 502 });

    const parsed = extractJsonObject(result.content);
    return NextResponse.json({
      report: parsed ? normalizeIgReport(parsed) : null,
      raw: parsed ? undefined : result.content.slice(0, 5000),
      provider: result.provider,
    });
  } catch (err) {
    const f = describeInstagramFailure(err);
    return NextResponse.json({ error: f.message, code: f.code }, { status: f.httpStatus });
  }
}
