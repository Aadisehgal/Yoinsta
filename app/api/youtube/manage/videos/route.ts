import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { getFreshAccessToken, getMyChannel } from "@/lib/youtube";
import { listManagedVideos, YouTubeApiError } from "@/lib/youtube-manage";
import { describeYouTubeFailure } from "@/lib/video-edit";

/** Lists the connected channel's videos — including unlisted, private and scheduled ones. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const channel = await prisma.channel.findFirst({
    where: { userId: session.user.id, platform: "youtube" },
  });
  if (!channel?.accessTokenEnc) return NextResponse.json({ connected: false });

  const rawToken = new URL(req.url).searchParams.get("pageToken");
  const pageToken = rawToken && /^[A-Za-z0-9_-]{1,120}$/.test(rawToken) ? rawToken : undefined;

  try {
    const accessToken = await getFreshAccessToken(channel.accessTokenEnc);
    const uploadsId = await cached(`yt:uploads-id:${session.user.id}`, 24 * 60 * 60, async () => {
      const mine = await getMyChannel(accessToken);
      return mine.uploadsPlaylistId;
    });

    const page = await listManagedVideos(accessToken, uploadsId, pageToken);
    return NextResponse.json({ connected: true, ...page });
  } catch (err) {
    return failureResponse(err);
  }
}

function failureResponse(err: unknown) {
  if (err instanceof YouTubeApiError) {
    const f = describeYouTubeFailure(err.status, err.reason, err.apiMessage);
    return NextResponse.json({ connected: true, error: f.message, code: f.code }, { status: f.httpStatus });
  }
  if (err instanceof Error && err.message.startsWith("YouTube token refresh failed")) {
    return NextResponse.json(
      { connected: true, error: "YouTube sign-in expired. Reconnect YouTube and try again.", code: "needs_reconnect" },
      { status: 401 }
    );
  }
  return NextResponse.json(
    { connected: true, error: "Couldn't load your videos right now.", code: "unknown" },
    { status: 502 }
  );
}
