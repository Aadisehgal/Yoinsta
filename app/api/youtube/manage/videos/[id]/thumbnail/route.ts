import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { getFreshAccessToken } from "@/lib/youtube";
import { getEditableVideo, setVideoThumbnail, YouTubeApiError } from "@/lib/youtube-manage";
import { describeYouTubeFailure, sniffImageType, THUMBNAIL_MAX_BYTES } from "@/lib/video-edit";

const VIDEO_ID = /^[\w-]{11}$/;
const DAILY_THUMBNAIL_LIMIT = 20;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  if (!VIDEO_ID.test(params.id)) return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image first.", code: "invalid" }, { status: 400 });
  }
  if (file.size > THUMBNAIL_MAX_BYTES) {
    return NextResponse.json({ error: "Thumbnail must be 2 MB or smaller.", code: "invalid" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    return NextResponse.json({ error: "Use a JPG, PNG or GIF image.", code: "invalid" }, { status: 400 });
  }

  try {
    const channel = await prisma.channel.findFirst({ where: { userId: session.user.id, platform: "youtube" } });
    if (!channel?.accessTokenEnc) {
      return NextResponse.json({ error: "Connect your YouTube channel first." }, { status: 400 });
    }

    const accessToken = await getFreshAccessToken(channel.accessTokenEnc);
    const video = await getEditableVideo(accessToken, params.id);
    if (!video || video.channelId !== channel.platformId) {
      return NextResponse.json({ error: "That video wasn't found on your channel." }, { status: 404 });
    }

    const quota = await checkAndConsumeQuota(session.user.id, "youtube_thumbnail_set", DAILY_THUMBNAIL_LIMIT);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Daily thumbnail limit reached (20). Try again tomorrow.", code: "quota" },
        { status: 429 }
      );
    }

    const url = await setVideoThumbnail(accessToken, params.id, bytes, mimeType);
    return NextResponse.json({ ok: true, thumbnail: url });
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      const f = describeYouTubeFailure(err.status, err.reason, err.apiMessage, "thumbnail");
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
}
