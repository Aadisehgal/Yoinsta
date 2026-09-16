import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

// One flat daily limit for everyone now — the old FREE 10/PRO unlimited split
// doesn't apply once there are no subscription tiers. Redis caching (15min/1hr)
// already absorbs most repeat traffic; this just stops one user from burning
// through Yoinsta's shared YouTube API quota on cache-miss days.
const DEFAULT_DAILY_LIMIT = 20;

function todayKey(userId: string, action: string): string {
  const day = new Date().toISOString().slice(0, 10); // UTC day bucket, resets daily
  return `quota:${action}:${userId}:${day}`;
}

/**
 * Consumes one unit of `action`'s daily quota for this user. Call this only
 * on an actual cache miss — cached reads should never touch it.
 */
export async function checkAndConsumeQuota(
  userId: string,
  action: string,
  limit = DEFAULT_DAILY_LIMIT
): Promise<{ allowed: boolean; remaining: number }> {
  const key = todayKey(userId, action);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60 * 60 * 26); // a little over a day, covers timezone edges
  }

  if (count > limit) {
    return { allowed: false, remaining: 0 };
  }

  // Redis counter is the fast path; UsageLog is the durable audit trail.
  await prisma.usageLog.create({ data: { userId, action } });

  return { allowed: true, remaining: limit - count };
}
