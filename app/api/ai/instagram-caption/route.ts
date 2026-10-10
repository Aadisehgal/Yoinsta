import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runChat } from "@/ai/router";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { fetchVideoMeta } from "@/lib/video-link";
import { extractVideoId, getUserAccessToken } from "@/lib/youtube";
import { getEditableVideo } from "@/lib/youtube-manage";
import { extractJsonObject } from "@/lib/video-analysis";
import {
  CAPTION_SYSTEM_PROMPT,
  buildCaptionPrompt,
  normalizeCaptionPack,
  type CaptionLang,
  type Tone,
} from "@/lib/instagram-copy";

export const maxDuration = 60;

const DAILY_LIMIT = 60;
const TONES: Tone[] = ["fun", "dramatic", "educational", "story"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { topic?: unknown; videoUrl?: unknown; tone?: unknown; lang?: unknown };
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 600) : "";
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const tone: Tone = TONES.includes(body.tone as Tone) ? (body.tone as Tone) : "fun";
  const lang: CaptionLang = body.lang === "hinglish" ? "hinglish" : "english";
  if (!topic && !videoUrl) {
    return NextResponse.json({ error: "Paste a YouTube link or describe the post first." }, { status: 400 });
  }

  // Facts about the video, when a link was given: the creator's own YouTube data if we can read it, else the public title.
  let videoTitle: string | undefined;
  let videoDescription: string | undefined;
  let videoTags: string[] | undefined;
  if (videoUrl) {
    const id = extractVideoId(videoUrl);
    if (!id) return NextResponse.json({ error: "That doesn't look like a YouTube video link." }, { status: 400 });
    const accessToken = await getUserAccessToken(session.user.id).catch(() => null);
    const own = accessToken ? await getEditableVideo(accessToken, id).catch(() => null) : null;
    if (own) {
      videoTitle = own.title;
      videoDescription = own.description;
      videoTags = own.tags;
    } else {
      const meta = await fetchVideoMeta(id).catch(() => null);
      if (!meta) {
        return NextResponse.json({ error: "Couldn't read that video — check the link and make sure it's public." }, { status: 400 });
      }
      videoTitle = meta.title;
    }
  }

  const quota = await checkAndConsumeQuota(session.user.id, "ai_instagram_caption", DAILY_LIMIT);
  if (!quota.allowed) {
    return NextResponse.json({ error: `Daily limit reached (${DAILY_LIMIT} caption packs). Try again tomorrow.` }, { status: 429 });
  }

  const prompt = buildCaptionPrompt({ topic, videoTitle, videoDescription, videoTags, tone, lang });
  const result = await runChat(session.user.id, CAPTION_SYSTEM_PROMPT, [{ role: "user", content: prompt }]);
  if (!result.success) return NextResponse.json({ error: result.error ?? "The AI request failed." }, { status: 502 });

  const parsed = extractJsonObject(result.content);
  return NextResponse.json({
    pack: parsed ? normalizeCaptionPack(parsed) : null,
    // If the model didn't return usable JSON, show its words instead of nothing.
    raw: parsed ? undefined : result.content.slice(0, 3000),
    video: videoTitle ? { title: videoTitle } : undefined,
  });
}
