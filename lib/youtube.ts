import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube token exchange failed: ${res.status} ${body}`);
  }
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

async function fetchChannel(accessToken: string, queryParam: string): Promise<YouTubeChannel | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&${queryParam}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`channels.list failed: ${res.status}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

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

export async function getMyChannel(accessToken: string): Promise<YouTubeChannel> {
  const channel = await fetchChannel(accessToken, "mine=true");
  if (!channel) throw new Error("No YouTube channel found on this Google account.");
  return channel;
}

/** Turns a pasted handle, URL, or raw channel ID into a channels.list query param. */
export function parseChannelInput(input: string): { id?: string; forHandle?: string } {
  const trimmed = input.trim();
  if (/^UC[\w-]{22}$/.test(trimmed)) return { id: trimmed };

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtube.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1]) return { id: parts[1] };
      if (parts[0]?.startsWith("@")) return { forHandle: parts[0] };
      if (parts[0] === "c" && parts[1]) return { forHandle: `@${parts[1]}` };
    }
  } catch {
    // not a URL — fall through to handle-style lookup below
  }

  return { forHandle: trimmed.startsWith("@") ? trimmed : `@${trimmed}` };
}

/** Looks up ANY public channel — used by the Competitors tool. */
export async function getPublicChannel(accessToken: string, input: string): Promise<YouTubeChannel | null> {
  const parsed = parseChannelInput(input);
  const queryParam = parsed.id ? `id=${parsed.id}` : `forHandle=${encodeURIComponent(parsed.forHandle as string)}`;
  return fetchChannel(accessToken, queryParam);
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

/** Looks up the user's connected channel and returns a fresh access token, or null if not connected. */
export async function getUserAccessToken(userId: string): Promise<string | null> {
  const channel = await prisma.channel.findFirst({
    where: { userId, platform: "youtube" },
  });
  if (!channel?.accessTokenEnc) return null;
  return getFreshAccessToken(channel.accessTokenEnc);
}

/** Pulls an 11-char video ID out of a full URL (watch/shorts/youtu.be) or accepts a raw ID. */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/")[2] || null;
      }
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Google's public (undocumented but widely used) autocomplete endpoint — the
 * same suggestions YouTube's own search box shows. No API key or quota cost.
 */
export async function getAutocompleteSuggestions(query: string): Promise<string[]> {
  const res = await fetch(
    `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.[1]) ? data[1] : [];
}

export interface SearchVideoResult {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  views: number;
}

/**
 * search.list costs 100 quota units (vs ~1 for list-by-id calls) — this is
 * the expensive call in the whole app. Callers MUST cache the result (24h,
 * per spec) and rate-limit it; see /api/youtube/keywords.
 */
export async function searchVideos(
  accessToken: string,
  query: string,
  maxResults = 10
): Promise<{ videos: SearchVideoResult[] }> {
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!searchRes.ok) throw new Error(`search.list failed: ${searchRes.status}`);
  const searchData = await searchRes.json();

  interface RawSearchItem {
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails?: { medium?: { url: string }; default?: { url: string } };
    };
  }

  const items: RawSearchItem[] = searchData.items ?? [];
  const ids = items.map((i) => i.id.videoId).filter(Boolean);
  if (ids.length === 0) return { videos: [] };

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!statsRes.ok) throw new Error(`videos.list (stats) failed: ${statsRes.status}`);
  const statsData = await statsRes.json();

  interface RawStats { id: string; statistics: { viewCount?: string } }
  const viewsById = new Map<string, number>(
    (statsData.items as RawStats[] ?? []).map((v) => [v.id, Number(v.statistics.viewCount ?? 0)])
  );

  return {
    videos: items.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
      views: viewsById.get(item.id.videoId) ?? 0,
    })),
  };
}

export interface OutlierVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
  channelAvgViews: number;
  multiplier: number;
}

/**
 * Finds videos that massively over-performed their channel's normal average —
 * a signal the topic/format broke out, worth studying or replicating.
 * Costs 100 (search) + ~2 (stats + channel batch) quota units per call.
 */
export async function findOutlierVideos(
  accessToken: string,
  query: string,
  maxResults = 15
): Promise<OutlierVideo[]> {
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!searchRes.ok) throw new Error(`search.list failed: ${searchRes.status}`);
  const searchData = await searchRes.json();

  interface RawSearchItem {
    id: { videoId: string };
    snippet: {
      title: string;
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      thumbnails?: { medium?: { url: string }; default?: { url: string } };
    };
  }

  const items: RawSearchItem[] = searchData.items ?? [];
  const videoIds = items.map((i) => i.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const videosRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!videosRes.ok) throw new Error(`videos.list (stats) failed: ${videosRes.status}`);
  const videosData = await videosRes.json();

  interface RawVideoStats { id: string; statistics: { viewCount?: string } }
  const viewsById = new Map<string, number>(
    (videosData.items as RawVideoStats[] ?? []).map((v) => [v.id, Number(v.statistics.viewCount ?? 0)])
  );

  const channelIds = Array.from(new Set(items.map((i) => i.snippet.channelId)));
  const channelsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!channelsRes.ok) throw new Error(`channels.list (batch) failed: ${channelsRes.status}`);
  const channelsData = await channelsRes.json();

  interface RawChannelStats { id: string; statistics: { viewCount?: string; videoCount?: string } }
  const channelAvgById = new Map<string, number>(
    (channelsData.items as RawChannelStats[] ?? []).map((c) => {
      const totalViews = Number(c.statistics.viewCount ?? 0);
      const totalVideos = Math.max(1, Number(c.statistics.videoCount ?? 1));
      return [c.id, Math.round(totalViews / totalVideos)];
    })
  );

  return items
    .map((item) => {
      const views = viewsById.get(item.id.videoId) ?? 0;
      const channelAvgViews = channelAvgById.get(item.snippet.channelId) ?? 0;
      const multiplier = channelAvgViews > 0 ? views / channelAvgViews : 0;
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
        views,
        publishedAt: item.snippet.publishedAt,
        channelAvgViews,
        multiplier: Math.round(multiplier * 10) / 10,
      };
    })
    .sort((a, b) => b.multiplier - a.multiplier);
}

export interface PublicVideoDetails {
  id: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
}

/** Fetches any public video by ID — 1 quota unit. Used by the SEO Score Checker. */
export async function getVideoById(accessToken: string, videoId: string): Promise<PublicVideoDetails | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`videos.list failed: ${res.status}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description ?? "",
    tags: item.snippet.tags ?? [],
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    views: Number(item.statistics?.viewCount ?? 0),
    likes: Number(item.statistics?.likeCount ?? 0),
    comments: Number(item.statistics?.commentCount ?? 0),
  };
}
