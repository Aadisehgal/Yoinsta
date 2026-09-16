import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { getFreshAccessToken, getMyChannel, getChannelVideos } from "@/lib/youtube";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const channel = await prisma.channel.findFirst({
    where: { userId: session.user.id, platform: "youtube" },
  });
  if (!channel || !channel.accessTokenEnc) {
    return NextResponse.json({ connected: false, videos: [] });
  }

  try {
    const videos = await cached(`yt:videos:${session.user.id}`, 60 * 60, async () => {
      const accessToken = await getFreshAccessToken(channel.accessTokenEnc as string);
      const freshChannel = await getMyChannel(accessToken);
      return getChannelVideos(accessToken, freshChannel.uploadsPlaylistId);
    });

    return NextResponse.json({ connected: true, videos });
  } catch {
    return NextResponse.json(
      { connected: true, videos: [], error: "Couldn't load videos right now." },
      { status: 502 }
    );
  }
}
