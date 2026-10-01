import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { getFreshAccessToken } from "@/lib/youtube";
import { getEditableVideo, updateVideo, YouTubeApiError } from "@/lib/youtube-manage";
import { describeYouTubeFailure, validateEditRequest } from "@/lib/video-edit";

const VIDEO_ID = /^[\w-]{11}$/;
// Each save costs 50 units of Yoinsta's shared YouTube quota (10,000/day for everyone).
const DAILY_EDIT_LIMIT = 30;

type RouteContext = { params: { id: string } };

async function loadContext(userId: string, videoId: string) {
  if (!VIDEO_ID.test(videoId)) return { error: NextResponse.json({ error: "Invalid video ID." }, { status: 400 }) };

  const channel = await prisma.channel.findFirst({ where: { userId, platform: "youtube" } });
  if (!channel?.accessTokenEnc) {
    return { error: NextResponse.json({ error: "Connect your YouTube channel first." }, { status: 400 }) };
  }

  const accessToken = await getFreshAccessToken(channel.accessTokenEnc);
  const video = await getEditableVideo(accessToken, videoId);

  // Defence in depth: YouTube already refuses edits to other people's videos, but check anyway.
  if (!video || video.channelId !== channel.platformId) {
    return { error: NextResponse.json({ error: "That video wasn't found on your channel." }, { status: 404 }) };
  }
  return { accessToken, video };
}

function failureResponse(err: unknown) {
  if (err instanceof YouTubeApiError) {
    const f = describeYouTubeFailure(err.status, err.reason, err.apiMessage);
    return NextResponse.json({ error: f.message, code: f.code }, { status: f.httpStatus });
  }
  if (err instanceof Error && err.message.startsWith("YouTube token refresh failed")) {
    return NextResponse.json(
      { error: "YouTube sign-in expired. Reconnect YouTube and try again.", code: "needs_reconnect" },
      { status: 401 }
    );
  }
  return NextResponse.json({ error: "Couldn't reach YouTube right now.", code: "unknown" }, { status: 502 });
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  try {
    const ctx = await loadContext(session.user.id, params.id);
    if ("error" in ctx) return ctx.error;
    return NextResponse.json({ video: ctx.video });
  } catch (err) {
    return failureResponse(err);
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = validateEditRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: "invalid" }, { status: 400 });

  try {
    const ctx = await loadContext(session.user.id, params.id);
    if ("error" in ctx) return ctx.error;

    const quota = await checkAndConsumeQuota(session.user.id, "youtube_video_edit", DAILY_EDIT_LIMIT);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Daily edit limit reached (30 saves). Try again tomorrow.", code: "quota" },
        { status: 429 }
      );
    }

    const video = await updateVideo(ctx.accessToken, ctx.video, parsed.value);
    return NextResponse.json({ video });
  } catch (err) {
    return failureResponse(err);
  }
}
