import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { cached } from "@/lib/redis";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { buildChannelContext } from "@/ai/channel-context";
import { describeVideoFailure, reviewYouTubeVideo } from "@/ai/providers/gemini-video";
import { extractVideoId, getFreshAccessToken } from "@/lib/youtube";
import { getEditableVideo, YouTubeApiError } from "@/lib/youtube-manage";
import { extractJsonObject, type Lang } from "@/lib/video-analysis";
import {
  MAX_REVIEW_SECONDS,
  SCENE_SYSTEM_PROMPT,
  buildScenePrompt,
  normalizeSceneReview,
} from "@/lib/scene-review";

// Gemini has to download and watch the video — give the function the full minute Vercel Hobby allows.
export const maxDuration = 60;

const DAILY_LIMIT = 20;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { videoId?: unknown; lang?: unknown };
  const videoId = typeof body.videoId === "string" ? extractVideoId(body.videoId) : null;
  if (!videoId) return NextResponse.json({ error: "Missing video." }, { status: 400 });
  const lang: Lang = body.lang === "english" ? "english" : "hinglish";

  // Only Gemini can take a YouTube video as input, so this needs a Gemini key specifically.
  const key = await prisma.apiKey.findFirst({
    where: { userId: session.user.id, provider: "gemini", isActive: true, lastTestOk: true },
    orderBy: { lastTestedAt: "desc" },
  });
  if (!key) {
    return NextResponse.json(
      { error: "Scene review needs a working Gemini key (only Gemini can watch YouTube videos). Add or re-test one in Settings." },
      { status: 400 }
    );
  }

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
    if (video.privacyStatus !== "public") {
      return NextResponse.json(
        { error: `Gemini can only watch Public videos, and this one is ${video.privacyStatus}. Make it Public first, then review it.` },
        { status: 400 }
      );
    }

    const quota = await checkAndConsumeQuota(session.user.id, "ai_video_scenes", DAILY_LIMIT);
    if (!quota.allowed) {
      return NextResponse.json({ error: `Daily scene-review limit reached (${DAILY_LIMIT}). Try again tomorrow.` }, { status: 429 });
    }

    const channelContext = await cached(`ai:channel-context:${session.user.id}`, 15 * 60, () =>
      buildChannelContext(accessToken)
    ).catch(() => "");

    const clipped = video.durationSeconds > MAX_REVIEW_SECONDS ? MAX_REVIEW_SECONDS : undefined;
    const prompt = buildScenePrompt({
      title: video.title,
      durationSeconds: video.durationSeconds,
      clippedToSeconds: clipped,
      channelContext,
      lang,
    });

    const { text, model } = await reviewYouTubeVideo(decrypt(key.keyEncrypted), {
      videoId,
      systemPrompt: SCENE_SYSTEM_PROMPT,
      prompt,
      endOffsetSeconds: clipped,
    });

    const parsed = extractJsonObject(text);
    return NextResponse.json({
      review: parsed ? normalizeSceneReview(parsed) : null,
      // If Gemini didn't return usable JSON, show its words instead of nothing.
      raw: parsed ? undefined : text.slice(0, 5000),
      model,
      clippedToSeconds: clipped,
    });
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: "Couldn't read this video from YouTube right now." }, { status: 502 });
    }
    if (err instanceof Error && err.message.startsWith("YouTube token refresh failed")) {
      return NextResponse.json({ error: "YouTube sign-in expired. Reconnect YouTube and try again.", code: "needs_reconnect" }, { status: 401 });
    }
    const failure = describeVideoFailure(err);
    return NextResponse.json({ error: failure.message }, { status: failure.httpStatus });
  }
}
