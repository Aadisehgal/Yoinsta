import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { runChat } from "@/ai/router";
import { buildChannelContext } from "@/ai/channel-context";
import { computeSeoScore } from "@/lib/seo-score";
import { extractVideoId, getAutocompleteSuggestions, getFreshAccessToken } from "@/lib/youtube";
import { getEditableVideo, YouTubeApiError } from "@/lib/youtube-manage";
import { cleanTags, tagsLength } from "@/lib/video-edit";
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  extractJsonObject,
  normalizeAnalysis,
  searchPhraseFromTitle,
  type Lang,
} from "@/lib/video-analysis";

// Bigger prompt + a model that may "think" first: give the function the full minute Vercel Hobby allows.
export const maxDuration = 60;

interface Draft {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { videoId?: unknown; draft?: Draft; lang?: unknown };
  const videoId = typeof body.videoId === "string" ? extractVideoId(body.videoId) : null;
  if (!videoId) return NextResponse.json({ error: "Missing video." }, { status: 400 });
  const lang: Lang = body.lang === "english" ? "english" : "hinglish";

  const channel = await prisma.channel.findFirst({ where: { userId: session.user.id, platform: "youtube" } });
  if (!channel?.accessTokenEnc) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const accessToken = await getFreshAccessToken(channel.accessTokenEnc);
    const video = await getEditableVideo(accessToken, videoId);
    if (!video || video.channelId !== channel.platformId) {
      return NextResponse.json({ error: "That video wasn't found on your channel." }, { status: 404 });
    }

    // Review what's on screen (unsaved edits) when the editor sends it, else what's saved on YouTube.
    const draft = body.draft ?? {};
    const title = typeof draft.title === "string" && draft.title.trim() ? draft.title.trim().slice(0, 200) : video.title;
    const description = typeof draft.description === "string" ? draft.description.slice(0, 6000) : video.description;
    const tags = Array.isArray(draft.tags)
      ? cleanTags(draft.tags.filter((t): t is string => typeof t === "string")).slice(0, 80)
      : video.tags;

    const seo = computeSeoScore({ title, description, tags });

    // Real search phrases (free, no quota) so tag advice isn't guesswork.
    const phrases = [searchPhraseFromTitle(title), tags[0] ?? ""].filter(
      (p, i, all) => p.length > 2 && all.indexOf(p) === i
    );
    const suggestions = (
      await Promise.all(
        phrases.slice(0, 2).map(async (phrase) => ({
          phrase,
          items: (await getAutocompleteSuggestions(phrase).catch(() => [])).slice(0, 10),
        }))
      )
    ).filter((s) => s.items.length > 0);

    // Same cached snapshot the Channel Audit chat uses — no extra YouTube calls on a warm cache.
    const channelContext = await cached(`ai:channel-context:${session.user.id}`, 15 * 60, () =>
      buildChannelContext(accessToken)
    ).catch(() => "");

    const prompt = buildAnalysisPrompt({
      title,
      description,
      tags,
      durationSeconds: video.durationSeconds,
      publishedAt: video.publishedAt,
      privacyStatus: video.privacyStatus,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      seo: {
        total: seo.total,
        title: seo.title.score,
        description: seo.description.score,
        tags: seo.tags.score,
        tips: seo.tips,
      },
      suggestions,
      channelContext,
      lang,
      tagCharsUsed: tagsLength(tags),
    });

    const result = await runChat(session.user.id, ANALYSIS_SYSTEM_PROMPT, [{ role: "user", content: prompt }]);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "The AI request failed." }, { status: 502 });
    }

    const parsed = extractJsonObject(result.content);
    await prisma.usageLog.create({ data: { userId: session.user.id, action: "ai_video_analysis" } });

    return NextResponse.json({
      seo: { total: seo.total, title: seo.title, description: seo.description, tags: seo.tags },
      analysis: parsed ? normalizeAnalysis(parsed, tags) : null,
      // If the model didn't return usable JSON, show its words instead of nothing.
      raw: parsed ? undefined : result.content.slice(0, 4000),
      provider: result.provider,
    });
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: "Couldn't read this video from YouTube right now." }, { status: 502 });
    }
    return NextResponse.json({ error: "Couldn't analyze this video right now." }, { status: 502 });
  }
}
