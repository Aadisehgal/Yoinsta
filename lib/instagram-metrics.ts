// Turns an Instagram account's recent posts into the numbers that matter, and builds the text the AI reads.
// Pure on purpose (no network / database) so the maths and the rules can be tested.

export type PostType = "REEL" | "CAROUSEL" | "IMAGE" | "VIDEO";

export interface IgPost {
  id: string;
  caption: string;
  type: PostType;
  permalink: string;
  thumbnail: string;
  timestamp: string;
  likes: number;
  comments: number;
  views: number | null;
  reach: number | null;
  shares: number | null;
  saved: number | null;
  interactions: number | null;
  avgWatchSeconds: number | null;
  /** Share of Reel views that left within the first 3 seconds, as a percentage 0-100. */
  skipRate: number | null;
  /** (likes + comments + shares + saves) ÷ reach, as a percentage. */
  engagementRate: number | null;
}

export interface IgProfile {
  igUserId: string;
  username: string;
  name: string;
  accountType: string;
  picture: string;
  followers: number;
  following: number;
  mediaCount: number;
}

/** Hashtags per post Instagram allows (limit introduced December 2025). Tags beyond this are ignored. */
export const IG_MAX_HASHTAGS = 5;

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Graph API times look like "2024-08-30T14:23:11+0000" — add the colon so every engine can read them. */
export function parseIgTime(value: string): number {
  return Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

// ---------------------------------------------------------------- reading API answers

/** Insights come back as {data:[{name, values:[{value}]}]} or {data:[{name, total_value:{value}}]}. */
export function parseInsightValues(json: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    const o = item as { name?: unknown; values?: { value?: unknown }[]; total_value?: { value?: unknown } };
    if (typeof o?.name !== "string") continue;
    const raw = o.total_value?.value ?? o.values?.[0]?.value;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) out[o.name] = n;
  }
  return out;
}

export interface RawMedia {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export function postTypeOf(raw: RawMedia): PostType {
  if (raw.media_product_type === "REELS") return "REEL";
  if (raw.media_type === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (raw.media_type === "VIDEO") return "VIDEO";
  return "IMAGE";
}

export function buildPost(raw: RawMedia, insights: Record<string, number> | null): IgPost | null {
  if (!raw.id || !raw.timestamp || !Number.isFinite(parseIgTime(raw.timestamp))) return null;
  const m = insights ?? {};
  const likes = m.likes ?? raw.like_count ?? 0;
  const comments = m.comments ?? raw.comments_count ?? 0;
  const shares = m.shares ?? null;
  const saved = m.saved ?? null;
  const reach = m.reach ?? null;
  const interactions = m.total_interactions ?? (likes + comments + (shares ?? 0) + (saved ?? 0));
  const skip = m.reels_skip_rate;

  return {
    id: raw.id,
    caption: raw.caption ?? "",
    type: postTypeOf(raw),
    permalink: raw.permalink ?? "",
    thumbnail: raw.thumbnail_url ?? raw.media_url ?? "",
    timestamp: raw.timestamp,
    likes,
    comments,
    views: m.views ?? null,
    reach,
    shares,
    saved,
    interactions,
    avgWatchSeconds: m.ig_reels_avg_watch_time !== undefined ? round(m.ig_reels_avg_watch_time / 1000, 1) : null,
    skipRate: skip === undefined ? null : round(skip <= 1 ? skip * 100 : skip, 1),
    engagementRate: reach && reach > 0 ? round((interactions / reach) * 100, 1) : null,
  };
}

/** The number that says "how well did this post do": views for video, reach for pictures. */
export function primaryMetric(p: IgPost): number {
  const video = p.type === "REEL" || p.type === "VIDEO";
  const value = video ? (p.views ?? p.reach) : (p.reach ?? p.views);
  return value ?? p.likes + p.comments;
}

// ---------------------------------------------------------------- hashtags and captions

export function extractHashtags(caption: string): string[] {
  const found = caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of found) {
    const key = tag.slice(1).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

// ---------------------------------------------------------------- summary of recent posts

export interface TypeStat {
  type: PostType;
  count: number;
  avgPrimary: number;
  avgEngagementRate: number | null;
}

export interface BestSlot {
  label: string;
  avgPrimary: number;
  count: number;
}

export interface IgSummary {
  count: number;
  medianPrimary: number;
  avgPrimary: number;
  avgEngagementRate: number | null;
  byType: TypeStat[];
  outliers: { post: IgPost; multiplier: number }[];
  postsPerWeek: number;
  bestWeekday: BestSlot | null;
  bestTime: BestSlot | null;
  hashtags: { avgCount: number; overLimitShare: number; top: { tag: string; uses: number; avgPrimary: number }[] };
  captions: { avgLength: number; shortAvg: number | null; longAvg: number | null };
  reels: { count: number; avgWatchSeconds: number | null; avgSkipRate: number | null };
}

function bestOf(groups: Map<string, number[]>, minPosts: number): BestSlot | null {
  let best: BestSlot | null = null;
  for (const [label, values] of groups) {
    if (values.length < minPosts) continue;
    const avg = mean(values);
    if (!best || avg > best.avgPrimary) best = { label, avgPrimary: Math.round(avg), count: values.length };
  }
  return best;
}

function hourWindow(hour: number): string {
  const start = Math.floor(hour / 3) * 3;
  const fmt = (h: number) => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${h % 24 < 12 ? "am" : "pm"}`;
  };
  return `${fmt(start)}–${fmt(start + 3)}`;
}

/** `tzOffsetMinutes` = minutes ahead of UTC for the viewer (India = 330), so days/hours match their clock. */
export function summarizePosts(posts: IgPost[], tzOffsetMinutes = 0): IgSummary {
  const primaries = posts.map(primaryMetric);
  const med = median(primaries);

  const types = new Map<PostType, IgPost[]>();
  for (const p of posts) types.set(p.type, [...(types.get(p.type) ?? []), p]);
  const byType: TypeStat[] = Array.from(types.entries())
    .map(([type, list]) => {
      const ers = list.map((p) => p.engagementRate).filter((x): x is number => x !== null);
      return {
        type,
        count: list.length,
        avgPrimary: Math.round(mean(list.map(primaryMetric))),
        avgEngagementRate: ers.length ? round(mean(ers), 1) : null,
      };
    })
    .sort((a, b) => b.avgPrimary - a.avgPrimary);

  const outliers =
    posts.length >= 5 && med > 0
      ? posts
          .map((post) => ({ post, multiplier: round(primaryMetric(post) / med, 1) }))
          .filter((o) => o.multiplier >= 3)
          .sort((a, b) => b.multiplier - a.multiplier)
          .slice(0, 3)
      : [];

  const times = posts.map((p) => parseIgTime(p.timestamp));
  let postsPerWeek = 0;
  if (posts.length >= 2) {
    const span = Math.max(1, (Math.max(...times) - Math.min(...times)) / DAY_MS);
    postsPerWeek = round(((posts.length - 1) / span) * 7, 1);
  }

  const weekdays = new Map<string, number[]>();
  const windows = new Map<string, number[]>();
  posts.forEach((p, i) => {
    const local = new Date(times[i] + tzOffsetMinutes * 60_000);
    const day = WEEKDAYS[local.getUTCDay()];
    weekdays.set(day, [...(weekdays.get(day) ?? []), primaries[i]]);
    const win = hourWindow(local.getUTCHours());
    windows.set(win, [...(windows.get(win) ?? []), primaries[i]]);
  });

  const tagLists = posts.map((p) => extractHashtags(p.caption));
  const tagStats = new Map<string, number[]>();
  tagLists.forEach((tags, i) => tags.forEach((t) => tagStats.set(t, [...(tagStats.get(t) ?? []), primaries[i]])));
  const topTags = Array.from(tagStats.entries())
    .filter(([, v]) => v.length >= 2)
    .map(([tag, v]) => ({ tag, uses: v.length, avgPrimary: Math.round(mean(v)) }))
    .sort((a, b) => b.avgPrimary - a.avgPrimary || b.uses - a.uses)
    .slice(0, 5);

  const lengths = posts.map((p) => Array.from(p.caption).length);
  const shortIdx = posts.map((_, i) => i).filter((i) => lengths[i] <= 100);
  const longIdx = posts.map((_, i) => i).filter((i) => lengths[i] > 100);

  const reels = posts.filter((p) => p.type === "REEL");
  const watch = reels.map((p) => p.avgWatchSeconds).filter((x): x is number => x !== null);
  const skip = reels.map((p) => p.skipRate).filter((x): x is number => x !== null);
  const allEr = posts.map((p) => p.engagementRate).filter((x): x is number => x !== null);

  return {
    count: posts.length,
    medianPrimary: Math.round(med),
    avgPrimary: Math.round(mean(primaries)),
    avgEngagementRate: allEr.length ? round(mean(allEr), 1) : null,
    byType,
    outliers,
    postsPerWeek,
    bestWeekday: bestOf(weekdays, 2),
    bestTime: bestOf(windows, 2),
    hashtags: {
      avgCount: round(mean(tagLists.map((t) => t.length)), 1),
      overLimitShare: posts.length ? round(tagLists.filter((t) => t.length > IG_MAX_HASHTAGS).length / posts.length, 2) : 0,
      top: topTags,
    },
    captions: {
      avgLength: Math.round(mean(lengths)),
      shortAvg: shortIdx.length >= 2 ? Math.round(mean(shortIdx.map((i) => primaries[i]))) : null,
      longAvg: longIdx.length >= 2 ? Math.round(mean(longIdx.map((i) => primaries[i]))) : null,
    },
    reels: {
      count: reels.length,
      avgWatchSeconds: watch.length ? round(mean(watch), 1) : null,
      avgSkipRate: skip.length ? round(mean(skip), 1) : null,
    },
  };
}

// ---------------------------------------------------------------- plain-language insights

const fmt = (n: number) => n.toLocaleString("en-US");
const snippet = (text: string, max = 60) => {
  const t = text.replace(/\s+/g, " ").trim();
  return Array.from(t).length > max ? `${Array.from(t).slice(0, max).join("")}…` : t || "(no caption)";
};

export function buildIgInsights(s: IgSummary): string[] {
  if (s.count < 3) return [];
  const out: string[] = [];

  if (s.byType.length >= 2 && s.byType[0].count >= 2) {
    const [best, ...rest] = s.byType;
    const worst = rest[rest.length - 1];
    if (worst.avgPrimary > 0 && best.avgPrimary / worst.avgPrimary >= 1.5) {
      out.push(
        `${best.type === "REEL" ? "Reels" : best.type === "CAROUSEL" ? "Carousels" : best.type === "VIDEO" ? "Videos" : "Photos"} do best for you: about ${fmt(best.avgPrimary)} per post, ${round(best.avgPrimary / worst.avgPrimary, 1)}× the ${worst.type === "REEL" ? "Reels" : worst.type === "CAROUSEL" ? "carousels" : worst.type === "VIDEO" ? "videos" : "photos"} (${fmt(worst.avgPrimary)}).`
      );
    }
  }

  if (s.outliers.length > 0) {
    const o = s.outliers[0];
    out.push(`Your breakout post: "${snippet(o.post.caption)}" — ${fmt(primaryMetric(o.post))}, ${o.multiplier}× your usual. Make more like it.`);
  }

  if (s.reels.avgSkipRate !== null) {
    out.push(
      `On average ${s.reels.avgSkipRate}% of Reel viewers leave in the first 3 seconds${s.reels.avgSkipRate >= 50 ? " — the opening needs to hook faster" : ""}.`
    );
  }

  if (s.bestWeekday && s.bestTime) {
    out.push(
      `Best results so far: ${s.bestWeekday.label}s (avg ${fmt(s.bestWeekday.avgPrimary)}, ${s.bestWeekday.count} posts) and ${s.bestTime.label} (avg ${fmt(s.bestTime.avgPrimary)}, ${s.bestTime.count} posts). Small sample — test it.`
    );
  }

  if (s.hashtags.overLimitShare > 0) {
    out.push(
      `${Math.round(s.hashtags.overLimitShare * 100)}% of your recent posts use more than ${IG_MAX_HASHTAGS} hashtags. Instagram now allows only ${IG_MAX_HASHTAGS}, and extra tags don't help — keep 3 to 5 that match the post.`
    );
  }

  if (s.captions.shortAvg !== null && s.captions.longAvg !== null) {
    const shortWins = s.captions.shortAvg >= s.captions.longAvg;
    out.push(
      `${shortWins ? "Short" : "Longer"} captions work better for you: ${fmt(shortWins ? s.captions.shortAvg : s.captions.longAvg)} vs ${fmt(shortWins ? s.captions.longAvg : s.captions.shortAvg)} on average.`
    );
  }

  out.push(`You post about ${s.postsPerWeek} time(s) a week.`);
  return out.slice(0, 6);
}

// ---------------------------------------------------------------- text for the AI

export interface AccountInsights {
  days: number;
  reach: number | null;
  views: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
}

export const IG_NOT_CONNECTED_NOTE =
  "Instagram is not connected. If the creator asks about Instagram, tell them to connect it on the Instagram page first.";

export function formatInstagramContext(
  profile: IgProfile,
  account: AccountInsights | null,
  posts: IgPost[],
  summary: IgSummary,
  followerGrowth: { days: number; subs: number } | null
): string {
  const lines: string[] = [];
  lines.push(
    `INSTAGRAM @${profile.username} (${profile.accountType}): ${fmt(profile.followers)} followers, following ${fmt(profile.following)}, ${fmt(profile.mediaCount)} posts.` +
      (followerGrowth ? ` Followers over ~${followerGrowth.days} days: ${followerGrowth.subs >= 0 ? "+" : ""}${fmt(followerGrowth.subs)}.` : "")
  );
  if (account) {
    const bits = [
      account.reach !== null ? `reach ${fmt(account.reach)}` : null,
      account.views !== null ? `views ${fmt(account.views)}` : null,
      account.accountsEngaged !== null ? `accounts engaged ${fmt(account.accountsEngaged)}` : null,
      account.totalInteractions !== null ? `interactions ${fmt(account.totalInteractions)}` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Last ${account.days} days: ${bits.join(", ")}.`);
  }
  lines.push(
    `Last ${summary.count} posts: median ${fmt(summary.medianPrimary)} (views for video, reach for pictures), average ${fmt(summary.avgPrimary)}` +
      (summary.avgEngagementRate !== null ? `, engagement ${summary.avgEngagementRate}% of reach` : "") +
      `, ${summary.postsPerWeek} posts/week.`
  );
  if (summary.byType.length) {
    lines.push("By format: " + summary.byType.map((t) => `${t.type} ×${t.count} avg ${fmt(t.avgPrimary)}`).join("; ") + ".");
  }
  lines.push(
    `Hashtags: ${summary.hashtags.avgCount} per post on average; ${Math.round(summary.hashtags.overLimitShare * 100)}% of posts exceed Instagram's limit of ${IG_MAX_HASHTAGS}.`
  );
  if (summary.reels.count) {
    lines.push(
      `Reels: ${summary.reels.count}` +
        (summary.reels.avgWatchSeconds !== null ? `, average watch ${summary.reels.avgWatchSeconds}s` : "") +
        (summary.reels.avgSkipRate !== null ? `, ${summary.reels.avgSkipRate}% skip within 3s` : "") +
        "."
    );
  }
  if (summary.bestWeekday && summary.bestTime) {
    lines.push(`Best so far: ${summary.bestWeekday.label}s, ${summary.bestTime.label} (small sample).`);
  }

  const describe = (p: IgPost) =>
    `- ${p.type} ${p.timestamp.slice(0, 10)}: ${p.views !== null ? `${fmt(p.views)} views, ` : ""}${p.reach !== null ? `${fmt(p.reach)} reach, ` : ""}${fmt(p.likes)} likes, ${fmt(p.comments)} comments` +
    `${p.shares !== null ? `, ${fmt(p.shares)} shares` : ""}${p.saved !== null ? `, ${fmt(p.saved)} saves` : ""}${p.skipRate !== null ? `, ${p.skipRate}% skip` : ""} — "${snippet(p.caption, 80)}"`;

  const top = [...posts].sort((a, b) => primaryMetric(b) - primaryMetric(a)).slice(0, 3);
  if (top.length) lines.push("Best posts:\n" + top.map(describe).join("\n"));
  const latest = [...posts].sort((a, b) => parseIgTime(b.timestamp) - parseIgTime(a.timestamp)).slice(0, 5);
  if (latest.length) lines.push("Latest posts:\n" + latest.map(describe).join("\n"));
  return lines.join("\n");
}
