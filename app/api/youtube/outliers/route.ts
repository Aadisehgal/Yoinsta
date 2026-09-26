import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { isUnlocked } from "@/lib/ads";
import { getUserAccessToken, findOutlierVideos } from "@/lib/youtube";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const topic = new URL(req.url).searchParams.get("q")?.trim();
  if (!topic) return NextResponse.json({ error: "q is required." }, { status: 400 });

  const resourceKey = `outliers:${topic.toLowerCase()}`;
  if (!(await isUnlocked(session.user.id, resourceKey))) {
    return NextResponse.json({ error: "Locked — watch an ad to unlock this search." }, { status: 403 });
  }

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const videos = await cached(`yt:outliers:${resourceKey}`, 24 * 60 * 60, async () => {
      // search.list is 100 quota units — same strict daily cap as Keywords.
      const quota = await checkAndConsumeQuota(session.user.id, "outlier_search", 5);
      if (!quota.allowed) throw new Error("QUOTA_EXCEEDED");

      return findOutlierVideos(accessToken, topic, 15);
    });

    return NextResponse.json({ topic, videos });
  } catch (err) {
    if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
      return NextResponse.json(
        { error: "Daily outlier-search limit reached — try again tomorrow." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Couldn't search for outliers right now." }, { status: 502 });
  }
}
