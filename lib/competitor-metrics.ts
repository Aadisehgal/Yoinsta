// Turns a channel's recent uploads into the numbers that matter for comparing channels, and builds the
// compact text the AI reads. Pure on purpose (no network, no database) so the maths can be tested.

export interface UploadSample {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
}

export interface ChannelInput {
  channelId: string;
  title: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  uploads: UploadSample[];
}

export interface TopVideo {
  id: string;
  title: string;
  views: number;
  ageDays: number;
  viewsPerDay: number;
  /** views ÷ this channel's median views — "how much better than their usual". */
  multiplier: number;
}

export interface TitleStyle {
  avgLength: number;
  questionShare: number;
  hashtagShare: number;
  emojiShare: number;
  topWords: string[];
}

export interface ChannelMetrics {
  channelId: string;
  title: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  sampleSize: number;
  avgViews: number;
  medianViews: number;
  uploadsPerWeek: number;
  shortsShare: number;
  /** Lifetime views per subscriber — high means the channel reaches far beyond its subscribers. */
  viewsPerSub: number;
  /** Average views of a recent upload per subscriber. */
  recentViewsPerSub: number;
  topVideos: TopVideo[];
  outliers: TopVideo[];
  titleStyle: TitleStyle;
  newestAgeDays: number | null;
}

export interface Growth {
  days: number;
  subs: number;
  views: number;
}

export interface SnapshotPoint {
  t: number;
  subs: number;
  views: number;
}

export const SHORTS_MAX_SECONDS = 180;
const DAY_MS = 86_400_000;

const STOP_WORDS = new Set(
  (
    "the and for with from that this what when how why who you your are was were has have had not but can will just into " +
    "out all its it's his her their them they our about over than then very more most some any one two new best top " +
    "video videos short shorts part full official ka ki ke hai hain me mein se ko aur ye yeh kya kaise kyun"
  ).split(" ")
);

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

export function analyzeTitles(titles: string[]): TitleStyle {
  const n = titles.length;
  if (n === 0) return { avgLength: 0, questionShare: 0, hashtagShare: 0, emojiShare: 0, topWords: [] };

  const share = (test: (t: string) => boolean) => round(titles.filter(test).length / n, 2);
  const docFreq = new Map<string, number>();
  for (const title of titles) {
    const words = new Set(
      (title.toLowerCase().replace(/#\S+/g, " ").match(/[\p{L}\p{N}']+/gu) ?? []).filter(
        (w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)
      )
    );
    for (const w of words) docFreq.set(w, (docFreq.get(w) ?? 0) + 1);
  }
  const topWords = Array.from(docFreq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([w]) => w);

  return {
    avgLength: Math.round(titles.reduce((sum, t) => sum + Array.from(t).length, 0) / n),
    questionShare: share((t) => /\?/.test(t) || /^(what|why|how|can|could|would|is|are|do|does)\b/i.test(t.trim())),
    hashtagShare: share((t) => /#\w/.test(t)),
    emojiShare: share((t) => /\p{Extended_Pictographic}/u.test(t)),
    topWords,
  };
}

export function computeMetrics(input: ChannelInput, now: Date = new Date()): ChannelMetrics {
  const uploads = input.uploads.filter((u) => Number.isFinite(Date.parse(u.publishedAt)));
  const views = uploads.map((u) => u.views);
  const medianViews = median(views);
  const avgViews = views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : 0;

  const ageDays = (iso: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
  const toTop = (u: UploadSample): TopVideo => {
    const age = ageDays(u.publishedAt);
    return {
      id: u.id,
      title: u.title,
      views: u.views,
      ageDays: age,
      viewsPerDay: Math.round(u.views / Math.max(1, age)),
      multiplier: medianViews > 0 ? round(u.views / medianViews, 1) : 0,
    };
  };

  const byViews = [...uploads].sort((a, b) => b.views - a.views);
  const topVideos = byViews.slice(0, 3).map(toTop);
  const outliers =
    uploads.length >= 5 && medianViews > 0
      ? byViews
          .map(toTop)
          .filter((v) => v.multiplier >= 3)
          .slice(0, 3)
      : [];

  // Uploads per week from how tightly the recent uploads are packed.
  let uploadsPerWeek = 0;
  if (uploads.length >= 2) {
    const times = uploads.map((u) => Date.parse(u.publishedAt));
    const spanDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / DAY_MS);
    uploadsPerWeek = round(((uploads.length - 1) / spanDays) * 7, 1);
  }

  const withDuration = uploads.filter((u) => u.durationSeconds > 0);
  const shortsShare = withDuration.length
    ? round(withDuration.filter((u) => u.durationSeconds <= SHORTS_MAX_SECONDS).length / withDuration.length, 2)
    : 0;

  const newest = uploads.length ? Math.max(...uploads.map((u) => Date.parse(u.publishedAt))) : null;

  return {
    channelId: input.channelId,
    title: input.title,
    subscribers: input.subscribers,
    totalViews: input.totalViews,
    videoCount: input.videoCount,
    sampleSize: uploads.length,
    avgViews,
    medianViews: Math.round(medianViews),
    uploadsPerWeek,
    shortsShare,
    viewsPerSub: input.subscribers > 0 ? round(input.totalViews / input.subscribers, 1) : 0,
    recentViewsPerSub: input.subscribers > 0 ? round(avgViews / input.subscribers, 1) : 0,
    topVideos,
    outliers,
    titleStyle: analyzeTitles(uploads.map((u) => u.title)),
    newestAgeDays: newest === null ? null : Math.max(0, Math.floor((now.getTime() - newest) / DAY_MS)),
  };
}

// ---------------------------------------------------------------- growth between visits

/** Take a new snapshot only if the newest one is older than ~a day (history is newest-first). */
export function shouldRecordSnapshot(history: SnapshotPoint[], nowMs: number): boolean {
  if (history.length === 0) return true;
  return nowMs - history[0].t >= 20 * 3_600_000;
}

/**
 * Change since about `days` ago, using the newest snapshot as "now". Needs a snapshot at least `days`
 * old but not absurdly old (up to 2×days), otherwise there is nothing fair to compare against yet.
 */
export function snapshotGrowth(history: SnapshotPoint[], nowMs: number, days = 7): Growth | null {
  if (history.length < 2) return null;
  const latest = history[0];
  const wanted = nowMs - days * DAY_MS;
  const base = history.find((p) => p.t <= wanted);
  if (!base || latest.t - base.t > 2 * days * DAY_MS) return null;
  const actualDays = Math.max(1, Math.round((latest.t - base.t) / DAY_MS));
  return { days: actualDays, subs: latest.subs - base.subs, views: latest.views - base.views };
}

// ---------------------------------------------------------------- plain-language insights

const fmt = (n: number) => n.toLocaleString("en-US");

function middle(values: number[]): number {
  return median(values);
}

/** A few facts worth a creator's attention, worked out without any AI. */
export function buildInsights(you: ChannelMetrics | null, others: ChannelMetrics[]): string[] {
  const rivals = others.filter((o) => o.sampleSize > 0);
  if (!you || you.sampleSize === 0 || rivals.length === 0) return [];
  const out: string[] = [];

  const rivalAvg = middle(rivals.map((r) => r.avgViews));
  if (rivalAvg > 0 && you.avgViews > 0) {
    const ratio = rivalAvg / you.avgViews;
    out.push(
      ratio >= 1.5
        ? `Your recent uploads average ${fmt(you.avgViews)} views. The middle competitor gets ${fmt(rivalAvg)} — about ${round(ratio, 1)}× more.`
        : ratio <= 0.67
          ? `Your recent uploads average ${fmt(you.avgViews)} views — more than the middle competitor (${fmt(rivalAvg)}). Keep going.`
          : `Your recent uploads average ${fmt(you.avgViews)} views, close to the middle competitor (${fmt(rivalAvg)}).`
    );
  }

  const reachy = rivals
    .filter((r) => r.recentViewsPerSub >= Math.max(1, you.recentViewsPerSub) * 3)
    .sort((a, b) => b.recentViewsPerSub - a.recentViewsPerSub)[0];
  if (reachy) {
    out.push(
      `${reachy.title} gets about ${fmt(Math.round(reachy.recentViewsPerSub))} views per subscriber on each upload (you: ${fmt(Math.round(you.recentViewsPerSub))}). Their videos travel far beyond their subscribers — study their titles and first seconds.`
    );
  }

  const rivalFreq = middle(rivals.map((r) => r.uploadsPerWeek));
  if (you.uploadsPerWeek > 0 || rivalFreq > 0) {
    out.push(`You upload about ${you.uploadsPerWeek} per week; the middle competitor uploads about ${rivalFreq}.`);
  }

  const rivalShorts = middle(rivals.map((r) => r.shortsShare));
  if (Math.abs(you.shortsShare - rivalShorts) >= 0.25) {
    out.push(
      `${Math.round(you.shortsShare * 100)}% of your recent uploads are Shorts, versus ${Math.round(rivalShorts * 100)}% for the middle competitor.`
    );
  }

  const best = rivals
    .flatMap((r) => r.outliers.map((o) => ({ ...o, channel: r.title })))
    .sort((a, b) => b.multiplier - a.multiplier)[0];
  if (best) {
    out.push(
      `Standout: "${best.title}" by ${best.channel} — ${fmt(best.views)} views, ${best.multiplier}× what that channel usually gets.`
    );
  }

  const theirWords = new Map<string, number>();
  for (const r of rivals) for (const w of r.titleStyle.topWords) theirWords.set(w, (theirWords.get(w) ?? 0) + 1);
  const yourWords = new Set(you.titleStyle.topWords);
  const missing = Array.from(theirWords.entries())
    .filter(([w]) => !yourWords.has(w))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([w]) => w);
  if (missing.length > 0) out.push(`Words competitors keep using in titles that you don't: ${missing.join(", ")}.`);

  return out.slice(0, 6);
}

// ---------------------------------------------------------------- text for the AI

function describe(m: ChannelMetrics, label: string, growth: Growth | null): string {
  const lines: string[] = [];
  lines.push(
    `${label} — ${m.title}: ${fmt(m.subscribers)} subscribers, ${fmt(m.totalViews)} lifetime views, ${fmt(m.videoCount)} videos.`
  );
  if (m.sampleSize === 0) {
    lines.push("  (no public uploads could be read)");
    return lines.join("\n");
  }
  lines.push(
    `  Last ${m.sampleSize} uploads: average ${fmt(m.avgViews)} views (median ${fmt(m.medianViews)}), ${m.uploadsPerWeek} uploads/week, ` +
      `${Math.round(m.shortsShare * 100)}% Shorts, ${m.recentViewsPerSub} views per subscriber per upload.`
  );
  if (m.newestAgeDays !== null) lines.push(`  Newest upload: ${m.newestAgeDays} day(s) ago.`);
  if (m.topVideos.length) {
    lines.push(
      "  Top recent: " +
        m.topVideos.map((v) => `"${v.title}" (${fmt(v.views)} views, ${v.ageDays}d old, ${v.multiplier}× their usual)`).join("; ")
    );
  }
  if (m.outliers.length) {
    lines.push("  Outliers (3× or more above their usual): " + m.outliers.map((v) => `"${v.title}"`).join("; "));
  }
  const s = m.titleStyle;
  lines.push(
    `  Title style: ${s.avgLength} chars on average, ${Math.round(s.questionShare * 100)}% questions, ${Math.round(s.hashtagShare * 100)}% hashtags, ${Math.round(s.emojiShare * 100)}% emoji` +
      (s.topWords.length ? `; common words: ${s.topWords.join(", ")}` : "")
  );
  if (growth) {
    lines.push(`  Growth over ~${growth.days} days: ${growth.subs >= 0 ? "+" : ""}${fmt(growth.subs)} subscribers, ${growth.views >= 0 ? "+" : ""}${fmt(growth.views)} views.`);
  }
  return lines.join("\n");
}

export interface IntelligenceView {
  you: ChannelMetrics | null;
  competitors: ChannelMetrics[];
  growth: Record<string, Growth | null>;
}

export const NO_COMPETITORS_NOTE =
  "No competitors are tracked yet. If the creator asks about competitors, tell them to add channels on the Competitors page first.";

export function formatCompetitorContext(intel: IntelligenceView): string {
  if (intel.competitors.length === 0) return NO_COMPETITORS_NOTE;
  const blocks: string[] = [];
  if (intel.you) blocks.push(describe(intel.you, "YOU", intel.growth[intel.you.channelId] ?? null));
  for (const c of intel.competitors) blocks.push(describe(c, "COMPETITOR", intel.growth[c.channelId] ?? null));
  blocks.push(
    "(Competitor numbers are public stats only — views, likes, titles, dates. Their analytics, revenue and retention are not visible.)"
  );
  return blocks.join("\n\n");
}
