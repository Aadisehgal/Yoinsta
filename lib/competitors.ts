import { cached, redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { getMyChannel, getPublicChannel, type YouTubeChannel } from "@/lib/youtube";
import { parseIsoDuration } from "@/lib/video-edit";
import {
  NO_COMPETITORS_NOTE,
  computeMetrics,
  formatCompetitorContext,
  shouldRecordSnapshot,
  snapshotGrowth,
  type ChannelMetrics,
  type Growth,
  type IntelligenceView,
  type SnapshotPoint,
  type UploadSample,
} from "@/lib/competitor-metrics";

const SAMPLE_SIZE = 25;
const UPLOADS_TTL_SECONDS = 6 * 60 * 60; // a channel's recent uploads change slowly — spare the API quota
const SNAPSHOT_KEEP = 120;
const SNAPSHOT_TTL_SECONDS = 150 * 24 * 60 * 60;
const API = "https://www.googleapis.com/youtube/v3";

/** Every channel's uploads playlist is its channel ID with the "UC" prefix swapped for "UU". */
export function uploadsPlaylistFor(channelId: string): string | null {
  return /^UC[\w-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

interface RawUpload {
  id?: string;
  snippet?: { title?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

/** A channel's newest public uploads with views and length — 2 YouTube quota units. */
export async function fetchRecentUploads(accessToken: string, channelId: string, count = SAMPLE_SIZE): Promise<UploadSample[]> {
  const playlistId = uploadsPlaylistFor(channelId);
  if (!playlistId) return [];
  const headers = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(
    `${API}/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${count}`,
    { headers }
  );
  if (listRes.status === 404) return []; // no uploads (or hidden)
  if (!listRes.ok) throw new Error(`playlistItems.list failed: ${listRes.status}`);
  const list = (await listRes.json()) as { items?: { contentDetails?: { videoId?: string } }[] };
  const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return [];

  const videosRes = await fetch(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}`, { headers });
  if (!videosRes.ok) throw new Error(`videos.list failed: ${videosRes.status}`);
  const videos = (await videosRes.json()) as { items?: RawUpload[] };

  return (videos.items ?? [])
    .filter((v) => v.id && v.snippet?.publishedAt)
    .map((v) => ({
      id: v.id as string,
      title: v.snippet?.title ?? "",
      publishedAt: v.snippet?.publishedAt as string,
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      durationSeconds: parseIsoDuration(v.contentDetails?.duration),
    }));
}

/** Remembers a snapshot of subscribers/views (at most one a day) and reports the change over ~7 days. */
async function trackGrowth(channelId: string, subs: number, views: number, now: Date): Promise<Growth | null> {
  try {
    const key = `yt:snap:${channelId}`;
    const raw = await redis.lrange(key, 0, SNAPSHOT_KEEP - 1);
    const history: SnapshotPoint[] = [];
    for (const line of raw) {
      try {
        const p = JSON.parse(line) as SnapshotPoint;
        if (Number.isFinite(p.t)) history.push(p);
      } catch {
        // skip a corrupt entry
      }
    }
    if (shouldRecordSnapshot(history, now.getTime())) {
      const point: SnapshotPoint = { t: now.getTime(), subs, views };
      await redis.lpush(key, JSON.stringify(point));
      await redis.ltrim(key, 0, SNAPSHOT_KEEP - 1);
      await redis.expire(key, SNAPSHOT_TTL_SECONDS);
      history.unshift(point);
    }
    return snapshotGrowth(history, now.getTime(), 7);
  } catch {
    return null; // growth is a bonus — never let Redis trouble break the page
  }
}

export interface Intelligence extends IntelligenceView {
  generatedAt: string;
  ownChannelId: string | null;
}

const FAILED_FETCH_PAUSE_SECONDS = 10 * 60;

/** Recent uploads, cached for hours. A channel that can't be read is retried only every 10 minutes, so one
 *  broken channel can't quietly spend YouTube quota on every page load. */
async function uploadsFor(accessToken: string, channelId: string): Promise<UploadSample[]> {
  const failKey = `yt:uploads25-failed:${channelId}`;
  if (await redis.get(failKey).catch(() => null)) return [];
  try {
    return await cached(`yt:uploads25:${channelId}`, UPLOADS_TTL_SECONDS, () => fetchRecentUploads(accessToken, channelId));
  } catch {
    await redis.set(failKey, "1", "EX", FAILED_FETCH_PAUSE_SECONDS).catch(() => null);
    return [];
  }
}

async function metricsFor(
  accessToken: string,
  stats: Pick<YouTubeChannel, "id" | "title" | "subscriberCount" | "viewCount" | "videoCount">,
  now: Date
): Promise<ChannelMetrics> {
  const uploads = await uploadsFor(accessToken, stats.id);
  return computeMetrics(
    {
      channelId: stats.id,
      title: stats.title,
      subscribers: stats.subscriberCount,
      totalViews: stats.viewCount,
      videoCount: stats.videoCount,
      uploads,
    },
    now
  );
}

/** The creator's own channel plus every tracked competitor, as comparable numbers. */
export async function loadIntelligence(userId: string, accessToken: string): Promise<Intelligence> {
  const now = new Date();
  const rows = await prisma.competitor.findMany({ where: { userId, platform: "youtube" }, orderBy: { id: "asc" } });

  const mine = await cached(`yt:mychannel:${userId}`, 60 * 60, () => getMyChannel(accessToken)).catch(() => null);

  const [you, rivals] = await Promise.all([
    mine ? metricsFor(accessToken, mine, now).catch(() => null) : Promise.resolve(null),
    Promise.all(
      rows.map(async (row) => {
        try {
          const stats = await cached(`yt:competitor:${row.channelId}`, 60 * 60, () =>
            getPublicChannel(accessToken, row.channelId)
          );
          return stats ? await metricsFor(accessToken, stats, now) : null;
        } catch {
          return null;
        }
      })
    ),
  ]);
  const competitors = rivals.filter((m): m is ChannelMetrics => m !== null);

  const growth: Record<string, Growth | null> = {};
  await Promise.all(
    [you, ...competitors]
      .filter((m): m is ChannelMetrics => m !== null)
      .map(async (m) => {
        growth[m.channelId] = await trackGrowth(m.channelId, m.subscribers, m.totalViews, now);
      })
  );

  return { you, competitors, growth, generatedAt: now.toISOString(), ownChannelId: mine?.id ?? null };
}

/** Text the AI chat reads: how the creator compares with the channels they track. */
export async function buildCompetitorContext(userId: string, accessToken: string): Promise<string> {
  const count = await prisma.competitor.count({ where: { userId, platform: "youtube" } });
  if (count === 0) return NO_COMPETITORS_NOTE;
  return formatCompetitorContext(await loadIntelligence(userId, accessToken));
}

/** Same, cached for a short while so a chat conversation doesn't re-read YouTube on every message. */
export function competitorContextCacheKey(userId: string): string {
  return `ai:competitor-context:${userId}`;
}

export async function getCompetitorContext(userId: string, accessToken: string): Promise<string> {
  return cached(competitorContextCacheKey(userId), 20 * 60, () => buildCompetitorContext(userId, accessToken)).catch(
    () => ""
  );
}
