import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { isUnlocked } from "@/lib/ads";
import { extractVideoId, getUserAccessToken, getVideoById } from "@/lib/youtube";
import { computeSeoScore } from "@/lib/seo-score";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { videoUrl } = await req.json().catch(() => ({}));
  const videoId = typeof videoUrl === "string" ? extractVideoId(videoUrl) : null;
  if (!videoId) {
    return NextResponse.json({ error: "Couldn't find a video ID in that URL." }, { status: 400 });
  }

  const resourceKey = `seo:${videoId}`;
  if (!(await isUnlocked(session.user.id, resourceKey))) {
    return NextResponse.json({ error: "Locked — watch an ad to unlock this video's score." }, { status: 403 });
  }

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const data = await cached(`yt:seoscore:${videoId}`, 60 * 60, async () => {
      const video = await getVideoById(accessToken, videoId);
      if (!video) throw new Error("NOT_FOUND");
      return { video, score: computeSeoScore(video) };
    });

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Video not found or is private." }, { status: 404 });
    }
    return NextResponse.json({ error: "Couldn't analyze this video right now." }, { status: 502 });
  }
}
