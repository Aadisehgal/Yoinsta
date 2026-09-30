import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateImage } from "@/ai/image-router";
import { extractVideoId, fetchChannelIcon, fetchVideoMeta, type VideoMeta } from "@/lib/video-link";

// Image generation is slow: up to 8s video lookup + 45s provider timeout.
export const maxDuration = 60;

const THUMBNAIL_STYLE_SUFFIX = " Bold, high-contrast YouTube thumbnail style: one clear focal subject, dramatic lighting, punchy saturated colors, readable at small size, no watermarks.";

function buildVideoPrompt(title: string, channel: string, extra: string): string {
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 200);
  const cleanChannel = channel.replace(/\s+/g, " ").trim().slice(0, 80);
  let prompt = `Create a YouTube thumbnail for a video titled "${cleanTitle}"${cleanChannel ? ` on the channel "${cleanChannel}"` : ""}. Pick the single most striking idea or moment from that title and show it as one clear focal subject. Any text in the image must be at most 3-4 large, bold, correctly spelled words.`;
  if (extra) prompt += ` Extra direction from the creator: ${extra.slice(0, 500)}`;
  return prompt;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = (await req.json().catch(() => null)) ?? {};
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const extra = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider : undefined;

  let prompt = extra;
  let meta: VideoMeta | null = null;

  if (videoUrl) {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return NextResponse.json({ error: "That doesn't look like a YouTube video link." }, { status: 400 });
    }
    meta = await fetchVideoMeta(videoId);
    if (!meta) {
      return NextResponse.json({ error: "Couldn't read that video — check the link and make sure it's public." }, { status: 400 });
    }
    prompt = buildVideoPrompt(meta.title, meta.channel, extra);
  }

  if (!prompt) {
    return NextResponse.json({ error: "Paste a video link or describe the thumbnail." }, { status: 400 });
  }

  // The channel icon lookup runs alongside image generation, so it adds no waiting time.
  const [result, avatarUrl] = await Promise.all([
    generateImage(session.user.id, prompt + THUMBNAIL_STYLE_SUFFIX, provider),
    meta ? fetchChannelIcon(meta.id, meta.channelUrl) : Promise.resolve(null),
  ]);

  const video = meta ? { title: meta.title, channel: meta.channel, avatarUrl } : undefined;
  return NextResponse.json({ ...result, video });
}
