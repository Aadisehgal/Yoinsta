import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cached } from "@/lib/redis";
import { checkAndConsumeQuota } from "@/lib/rate-limit";
import { isUnlocked } from "@/lib/ads";
import { getUserAccessToken, getAutocompleteSuggestions, searchVideos } from "@/lib/youtube";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const topic = new URL(req.url).searchParams.get("q")?.trim();
  if (!topic) return NextResponse.json({ error: "q is required." }, { status: 400 });

  const resourceKey = `keywords:${topic.toLowerCase()}`;
  if (!(await isUnlocked(session.user.id, resourceKey))) {
    return NextResponse.json({ error: "Locked — watch an ad to unlock this search." }, { status: 403 });
  }

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const data = await cached(`yt:keywords:${resourceKey}`, 24 * 60 * 60, async () => {
      // search.list is 100 quota units — a much stricter daily cap than other actions.
      const quota = await checkAndConsumeQuota(session.user.id, "keyword_search", 5);
      if (!quota.allowed) throw new Error("QUOTA_EXCEEDED");

      const [suggestions, search] = await Promise.all([
        getAutocompleteSuggestions(topic),
        searchVideos(accessToken, topic, 10),
      ]);

      const avgViews = search.videos.length
        ? Math.round(search.videos.reduce((sum, v) => sum + v.views, 0) / search.videos.length)
        : 0;
      const uniqueChannels = new Set(search.videos.map((v) => v.channelTitle)).size;

      // Heuristic estimate from top-ranking videos — NOT real Google Trends
      // search-volume data (that needs a paid Google Ads API integration).
      const viewsFactor = Math.min(100, Math.log10(avgViews + 1) * 18);
      const concentrationFactor = search.videos.length
        ? (1 - uniqueChannels / search.videos.length) * 40
        : 0;
      const competitionScore = Math.round(Math.min(100, viewsFactor + concentrationFactor));
      const opportunityScore = Math.max(0, 100 - competitionScore);

      return {
        topic,
        suggestions: suggestions.slice(0, 10).map((keyword, i) => ({ keyword, popularityRank: i + 1 })),
        competition: {
          avgViews,
          sampledVideos: search.videos.length,
          uniqueChannels,
          competitionScore,
          opportunityScore,
        },
        topVideos: search.videos.slice(0, 5),
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
      return NextResponse.json(
        { error: "Daily keyword-search limit reached — try again tomorrow." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Couldn't fetch keyword data right now." }, { status: 502 });
  }
}
