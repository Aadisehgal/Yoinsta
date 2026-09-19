import { decrypt } from "@/lib/encryption";

const REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/youtube/callback`;

// youtube.readonly (channel/video metadata) + yt-analytics.readonly (watch time, views over time)
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

export function buildYouTubeAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID as string,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // required to get a refresh_token
    prompt: "consent", // forces the consent screen so we get a refresh_token every time
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID as string,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET as string,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`YouTube token exchange failed: ${res.status}`);
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID as string,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET as string,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${res.status}`);
  return res.json();
}

/** Decrypts the stored refresh token and mints a fresh access token for this call. */
export async function getFreshAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decrypt(encryptedRefreshToken);
  const { access_token } = await refreshAccessToken(refreshToken);
  return access_token;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
}

export async function getMyChannel(accessToken: string): Promise<YouTubeChannel> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`channels.list failed: ${res.status}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error("No YouTube channel found on this Google account.");

  return {
    id: item.id,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
    subscriberCount: Number(item.statistics.subscriberCount ?? 0),
    viewCount: Number(item.statistics.viewCount ?? 0),
    videoCount: Number(item.statistics.videoCount ?? 0),
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

export interface YouTubeVideoStats {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
}

/** Uploads-playlist → video IDs → stats. Sorted by views, most-viewed first. */
export async function getChannelVideos(
  accessToken: string,
  uploadsPlaylistId: string,
  maxResults = 25
): Promise<YouTubeVideoStats[]> {
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!playlistRes.ok) throw new Error(`playlistItems.list failed: ${playlistRes.status}`);
  const playlistData = await playlistRes.json();
  const videoIds: string[] = (playlistData.items ?? []).map(
    (item: { contentDetails: { videoId: string } }) => item.contentDetails.videoId
  );
  if (videoIds.length === 0) return [];

  const videosRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!videosRes.ok) throw new Error(`videos.list failed: ${videosRes.status}`);
  const videosData = await videosRes.json();

  interface RawVideo {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  }

  return (videosData.items as RawVideo[])
    .map((v) => ({
      id: v.id,
      title: v.snippet.title,
      thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? "",
      publishedAt: v.snippet.publishedAt,
      views: Number(v.statistics.viewCount ?? 0),
      likes: Number(v.statistics.likeCount ?? 0),
      comments: Number(v.statistics.commentCount ?? 0),
    }))
    .sort((a, b) => b.views - a.views);
}

export interface AnalyticsSummary {
  totalViews28d: number;
  totalWatchMinutes28d: number;
  subscribersGained28d: number;
  daily: { date: string; views: number }[];
}

/** Views, watch time, and subscriber growth for the last 28 days (needs yt-analytics.readonly). */
export async function getAnalyticsSummary(accessToken: string): Promise<AnalyticsSummary> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: fmt(start),
    endDate: fmt(end),
    metrics: "views,estimatedMinutesWatched,subscribersGained",
    dimensions: "day",
    sort: "day",
  });

  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube Analytics report failed: ${res.status}`);
  const data = await res.json();

  const rows: [string, number, number, number][] = data.rows ?? [];

  return {
    totalViews28d: rows.reduce((sum, r) => sum + r[1], 0),
    totalWatchMinutes28d: rows.reduce((sum, r) => sum + r[2], 0),
    subscribersGained28d: rows.reduce((sum, r) => sum + r[3], 0),
    daily: rows.map(([date, views]) => ({ date, views })),
  };
}
