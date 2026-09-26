import { getMyChannel, getAnalyticsSummary, getChannelVideos } from "@/lib/youtube";

/** Everything the AI needs to answer "why aren't my views growing" honestly, not generically. */
export async function buildChannelContext(accessToken: string): Promise<string> {
  const channel = await getMyChannel(accessToken);
  const analytics = await getAnalyticsSummary(accessToken).catch(() => null);
  const videos = await getChannelVideos(accessToken, channel.uploadsPlaylistId, 15).catch(() => []);

  const recentVideosText = videos
    .map(
      (v, i) =>
        `${i + 1}. "${v.title}" — ${v.views} views, ${v.likes} likes, ${v.comments} comments, published ${v.publishedAt.slice(0, 10)}`
    )
    .join("\n");

  return [
    `Channel: ${channel.title}`,
    `Subscribers: ${channel.subscriberCount}`,
    `Total views (lifetime): ${channel.viewCount}`,
    `Total videos: ${channel.videoCount}`,
    analytics
      ? `Last 28 days — Views: ${analytics.totalViews28d}, Watch time: ${Math.round(analytics.totalWatchMinutes28d / 60)} hrs, Subscribers gained: ${analytics.subscribersGained28d}`
      : "Last 28 days analytics: unavailable right now.",
    "",
    "Recent videos, most recent first (up to 15):",
    recentVideosText || "No videos found on this channel yet.",
  ].join("\n");
}
