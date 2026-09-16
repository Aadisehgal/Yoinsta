import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/redis";
import { getFreshAccessToken, getMyChannel, getAnalyticsSummary } from "@/lib/youtube";
import { checkAndConsumeQuota } from "@/lib/rate-limit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const channel = await prisma.channel.findFirst({
    where: { userId: session.user.id, platform: "youtube" },
  });
  if (!channel || !channel.accessTokenEnc) {
    return NextResponse.json({ connected: false });
  }

  try {
    const data = await cached(`yt:dashboard:${session.user.id}`, 15 * 60, async () => {
      const quota = await checkAndConsumeQuota(session.user.id, "youtube_dashboard_refresh");
      if (!quota.allowed) throw new Error("QUOTA_EXCEEDED");

      const accessToken = await getFreshAccessToken(channel.accessTokenEnc as string);
      const [freshChannel, analytics] = await Promise.all([
        getMyChannel(accessToken),
        getAnalyticsSummary(accessToken),
      ]);

      return { channel: freshChannel, analytics };
    });

    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
      return NextResponse.json(
        { connected: true, error: "Daily refresh limit reached — try again tomorrow." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { connected: true, error: "Couldn't load your YouTube stats right now." },
      { status: 502 }
    );
  }
}
