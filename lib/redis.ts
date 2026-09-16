import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL as string, {
    maxRetriesPerRequest: null, // required for BullMQ workers sharing this connection
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** Small helper: cache-aside read with a TTL, used by every YouTube/Instagram endpoint. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;

  const value = await fetcher();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}
