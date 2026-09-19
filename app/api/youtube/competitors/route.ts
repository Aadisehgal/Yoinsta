import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { getUserAccessToken, getPublicChannel } from "@/lib/youtube";

const MAX_COMPETITORS = 5;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  const competitors = await prisma.competitor.findMany({
    where: { userId: session.user.id, platform: "youtube" },
    orderBy: { id: "asc" },
  });

  const withStats = await Promise.all(
    competitors.map(async (c) => {
      try {
        const channel = await cached(`yt:competitor:${c.channelId}`, 60 * 60, () =>
          getPublicChannel(accessToken, c.channelId)
        );
        return { id: c.id, channelId: c.channelId, title: c.title, channel };
      } catch {
        return { id: c.id, channelId: c.channelId, title: c.title, channel: null };
      }
    })
  );

  return NextResponse.json({ competitors: withStats });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { input } = await req.json().catch(() => ({}));
  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Paste a channel URL, @handle, or ID." }, { status: 400 });
  }

  const count = await prisma.competitor.count({
    where: { userId: session.user.id, platform: "youtube" },
  });
  if (count >= MAX_COMPETITORS) {
    return NextResponse.json({ error: `You can track up to ${MAX_COMPETITORS} competitors.` }, { status: 400 });
  }

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const channel = await getPublicChannel(accessToken, input);
    if (!channel) {
      return NextResponse.json({ error: "Couldn't find that channel — check the URL or handle." }, { status: 404 });
    }

    const existing = await prisma.competitor.findFirst({
      where: { userId: session.user.id, platform: "youtube", channelId: channel.id },
    });
    if (existing) {
      return NextResponse.json({ error: "You're already tracking this channel." }, { status: 400 });
    }

    const competitor = await prisma.competitor.create({
      data: { userId: session.user.id, platform: "youtube", channelId: channel.id, title: channel.title },
    });

    return NextResponse.json({ id: competitor.id, channelId: channel.id, title: channel.title, channel });
  } catch {
    return NextResponse.json({ error: "Couldn't look up that channel right now." }, { status: 502 });
  }
}
