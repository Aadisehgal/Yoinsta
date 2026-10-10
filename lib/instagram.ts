import { prisma } from "@/lib/prisma";
import { cached, redis } from "@/lib/redis";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  InstagramApiError,
  buildPost,
  fetchAccountInsights,
  fetchMediaInsights,
  fetchProfile,
  fetchRecentMedia,
  refreshLongLived,
} from "@/lib/instagram-api";
import {
  IG_NOT_CONNECTED_NOTE,
  buildIgInsights,
  formatInstagramContext,
  parseIgTime,
  summarizePosts,
  type AccountInsights,
  type IgPost,
  type IgProfile,
  type IgSummary,
} from "@/lib/instagram-metrics";
import { isExpired, needsRefresh, packToken, unpackToken, type StoredToken } from "@/lib/instagram-token";
import { shouldRecordSnapshot, snapshotGrowth, type SnapshotPoint } from "@/lib/competitor-metrics";

const POSTS_TO_ANALYSE = 20;
const OVERVIEW_TTL_SECONDS = 30 * 60;
const SNAPSHOT_KEEP = 120;
const SNAPSHOT_TTL_SECONDS = 150 * 24 * 60 * 60;

export interface InstagramAccess {
  token: string;
  igUserId: string;
  username: string;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function getInstagramChannel(userId: string) {
  return prisma.channel.findFirst({ where: { userId, platform: "instagram" }, orderBy: { connectedAt: "desc" } });
}

/** Stores a long-lived token (encrypted, with its dates) for this account. */
export async function saveInstagramConnection(
  userId: string,
  profile: IgProfile,
  token: string,
  expiresInSeconds: number
): Promise<void> {
  const now = nowSeconds();
  const stored: StoredToken = { token, issuedAt: now, expiresAt: now + expiresInSeconds };
  await prisma.channel.upsert({
    where: { userId_platform_platformId: { userId, platform: "instagram", platformId: profile.igUserId } },
    create: {
      userId,
      platform: "instagram",
      platformId: profile.igUserId,
      title: profile.username,
      thumbnail: profile.picture || null,
      accessTokenEnc: encrypt(packToken(stored)),
    },
    update: { title: profile.username, thumbnail: profile.picture || null, accessTokenEnc: encrypt(packToken(stored)) },
  });
}

export function instagramCacheKeys(userId: string, igUserId?: string): string[] {
  return [`ai:ig-context:${userId}`, ...(igUserId ? [`ig:overview:${igUserId}:0`, `ig:overview:${igUserId}:330`] : [])];
}

/**
 * The token to use right now. Refreshes it quietly when it is getting old (Instagram tokens last 60 days and
 * can be renewed once they are a day old), and throws code 190 if it has already expired so callers show
 * "Reconnect Instagram".
 */
export async function getInstagramAccess(userId: string): Promise<InstagramAccess | null> {
  const channel = await getInstagramChannel(userId);
  if (!channel?.accessTokenEnc) return null;

  const stored = unpackToken(decrypt(channel.accessTokenEnc), nowSeconds());
  if (!stored) return null;
  if (isExpired(stored, nowSeconds())) throw new InstagramApiError(401, 190);

  let token = stored.token;
  if (needsRefresh(stored, nowSeconds())) {
    try {
      const fresh = await refreshLongLived(stored.token);
      const now = nowSeconds();
      token = fresh.token;
      await prisma.channel.update({
        where: { id: channel.id },
        data: { accessTokenEnc: encrypt(packToken({ token, issuedAt: now, expiresAt: now + fresh.expiresIn })) },
      });
    } catch (err) {
      // Still valid for now — only a hard "token invalid" answer should stop the request.
      if (err instanceof InstagramApiError && err.code === 190) throw err;
    }
  }
  return { token, igUserId: channel.platformId, username: channel.title };
}

// ---------------------------------------------------------------- overview

export interface InstagramOverview {
  profile: IgProfile;
  account: AccountInsights | null;
  posts: IgPost[];
  summary: IgSummary;
  insights: string[];
  followerGrowth: { days: number; subs: number } | null;
  generatedAt: string;
}

/** Runs at most `limit` tasks at the same time, keeping results in order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function trackFollowers(igUserId: string, followers: number, now: Date): Promise<{ days: number; subs: number } | null> {
  try {
    const key = `ig:snap:${igUserId}`;
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
      const point: SnapshotPoint = { t: now.getTime(), subs: followers, views: 0 };
      await redis.lpush(key, JSON.stringify(point));
      await redis.ltrim(key, 0, SNAPSHOT_KEEP - 1);
      await redis.expire(key, SNAPSHOT_TTL_SECONDS);
      history.unshift(point);
    }
    const g = snapshotGrowth(history, now.getTime(), 7);
    return g ? { days: g.days, subs: g.subs } : null;
  } catch {
    return null; // follower growth is a bonus — Redis trouble must not break the page
  }
}

async function buildOverview(access: InstagramAccess, tzOffsetMinutes: number): Promise<InstagramOverview> {
  const now = new Date();
  const profile = await fetchProfile(access.token);
  const media = await fetchRecentMedia(access.token, POSTS_TO_ANALYSE);

  const posts = (
    await mapLimit(media, 4, async (m) => {
      const ageMs = now.getTime() - (m.timestamp ? parseIgTime(m.timestamp) : 0);
      // Fresh posts change quickly; older posts barely move — spare Instagram's rate limit.
      const ttl = ageMs < 2 * 86_400_000 ? 30 * 60 : 6 * 60 * 60;
      const insights = m.id ? await cached(`ig:mi:${m.id}`, ttl, async () => fetchMediaInsights(access.token, m)) : null;
      return buildPost(m, insights);
    })
  ).filter((p): p is IgPost => p !== null);

  const account = await cached(`ig:acct:${profile.igUserId}`, OVERVIEW_TTL_SECONDS, () => fetchAccountInsights(access.token, 28));
  const summary = summarizePosts(posts, tzOffsetMinutes);
  const followerGrowth = await trackFollowers(profile.igUserId, profile.followers, now);

  return { profile, account, posts, summary, insights: buildIgInsights(summary), followerGrowth, generatedAt: now.toISOString() };
}

export async function loadInstagramOverview(userId: string, tzOffsetMinutes = 0, refresh = false): Promise<InstagramOverview | null> {
  const access = await getInstagramAccess(userId);
  if (!access) return null;
  const key = `ig:overview:${access.igUserId}:${tzOffsetMinutes}`;
  if (refresh) await redis.del(key).catch(() => 0);
  return cached(key, OVERVIEW_TTL_SECONDS, () => buildOverview(access, tzOffsetMinutes));
}

/** Text the AI chat reads about the connected Instagram account (a short note if it isn't connected). */
export async function getInstagramContext(userId: string): Promise<string> {
  return cached(`ai:ig-context:${userId}`, 20 * 60, async () => {
    const channel = await getInstagramChannel(userId);
    if (!channel) return IG_NOT_CONNECTED_NOTE;
    const o = await loadInstagramOverview(userId, 0);
    if (!o) return IG_NOT_CONNECTED_NOTE;
    return formatInstagramContext(o.profile, o.account, o.posts, o.summary, o.followerGrowth);
  }).catch(() => "");
}
