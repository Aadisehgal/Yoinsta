import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAI } from "@/ai/router";
import { extractJsonObject } from "@/lib/video-analysis";
import { extractVideoId, fetchVideoMeta } from "@/lib/video-link";

// Video lookup (up to 8 s) + one text-AI call.
export const maxDuration = 60;

/**
 * Writes a ready-to-paste image prompt for a thumbnail. Works with ANY text key (Groq, Gemini, OpenAI,
 * Claude), including free ones — for people whose key can't generate images (free Gemini keys can't).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = ((await req.json().catch(() => null)) ?? {}) as { videoUrl?: unknown; prompt?: unknown };
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  const extra = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";

  let topic = extra;
  let channel = "";
  if (videoUrl) {
    const id = extractVideoId(videoUrl);
    if (!id) return NextResponse.json({ error: "That doesn't look like a YouTube video link." }, { status: 400 });
    const meta = await fetchVideoMeta(id);
    if (!meta) {
      return NextResponse.json({ error: "Couldn't read that video — check the link and make sure it's public." }, { status: 400 });
    }
    topic = meta.title.replace(/\s+/g, " ").trim().slice(0, 200);
    channel = meta.channel.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  if (!topic) return NextResponse.json({ error: "Paste a video link or describe the thumbnail." }, { status: 400 });

  const instruction = [
    "You write prompts for AI image generators.",
    `Write ONE detailed prompt for a YouTube thumbnail for a video titled "${topic}"${channel ? ` on the channel "${channel}"` : ""}.`,
    "Rules: 16:9 landscape; one clear focal subject; dramatic lighting; punchy saturated colors; readable at small size; no watermarks, logos or real people.",
    "Describe the subject and its pose or expression, the background, lighting, colors, camera angle and visual style in 3-5 sentences.",
    "Do NOT ask the generator to draw any words — image generators misspell text. Instead give 3 short text-overlay options (max 3 words each, ALL CAPS) the creator can add later in an editor.",
    videoUrl && extra ? `Extra direction from the creator: ${extra}` : "",
    'Return ONLY JSON, no markdown: {"prompt": "...", "textOptions": ["...", "...", "..."]}',
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runAI(session.user.id, instruction);
  if (!result.success) return NextResponse.json({ success: false, error: result.error ?? "The AI request failed." }, { status: 502 });

  const parsed = extractJsonObject(result.content) as { prompt?: unknown; textOptions?: unknown } | null;
  const prompt = typeof parsed?.prompt === "string" && parsed.prompt.trim() ? parsed.prompt.trim().slice(0, 1500) : result.content.trim().slice(0, 1500);
  const textOptions = Array.isArray(parsed?.textOptions)
    ? parsed.textOptions.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 5)
    : [];

  return NextResponse.json({ success: true, prompt, textOptions });
}
