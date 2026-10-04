"use client";

import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn, formatIndianNumber } from "@/lib/utils";
import type { ChannelMetrics, Growth, TopVideo } from "@/lib/competitor-metrics";

export interface InsightsData {
  you: ChannelMetrics | null;
  competitors: ChannelMetrics[];
  growth: Record<string, Growth | null>;
  insights: string[];
}

const ASK_PROMPTS = [
  "Compare me with my competitors using the numbers.",
  "What is working for my competitors that I'm not doing?",
  "Give me 5 video ideas based on my competitors' best videos.",
];

function ageLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** The index of the best (largest) value in a column — highlighted so the winner is easy to spot. */
function bestIndex(values: number[]): number {
  let best = -1;
  let max = 0;
  values.forEach((v, i) => {
    if (v > max) {
      max = v;
      best = i;
    }
  });
  return best;
}

function growthText(g: Growth | null | undefined): string {
  if (!g) return "—";
  const sign = (n: number) => (n > 0 ? "+" : "");
  return `${sign(g.subs)}${formatIndianNumber(g.subs)} subs · ${sign(g.views)}${formatIndianNumber(g.views)} views (${g.days}d)`;
}

export function InsightsPanel({ data }: { data: InsightsData }) {
  const rows = [data.you, ...data.competitors].filter((m): m is ChannelMetrics => m !== null);
  const hasUploads = rows.some((m) => m.sampleSize > 0);
  const anyGrowth = rows.some((m) => data.growth[m.channelId]);

  const avgBest = bestIndex(rows.map((m) => m.avgViews));
  const freqBest = bestIndex(rows.map((m) => m.uploadsPerWeek));
  const reachBest = bestIndex(rows.map((m) => m.recentViewsPerSub));

  const standouts: (TopVideo & { channel: string })[] = data.competitors
    .flatMap((c) => (c.outliers.length > 0 ? c.outliers : c.topVideos.slice(0, 1)).map((v) => ({ ...v, channel: c.title })))
    .sort((a, b) => b.multiplier - a.multiplier || b.views - a.views)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <CardTitle>How you compare</CardTitle>
          <CardDescription>
            Based on each channel&apos;s latest uploads (public numbers). The best value in each column is highlighted.
          </CardDescription>
        </div>

        {!hasUploads ? (
          <p className="text-sm text-muted">Couldn&apos;t read these channels&apos; recent videos right now. Try again in a minute.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-normal">Channel</th>
                  <th className="px-2 py-2 font-normal">Avg views</th>
                  <th className="px-2 py-2 font-normal">Uploads / week</th>
                  <th className="px-2 py-2 font-normal">Shorts</th>
                  <th className="px-2 py-2 font-normal">Views per sub</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => {
                  const isYou = data.you !== null && m.channelId === data.you.channelId;
                  return (
                    <tr key={m.channelId} className={cn("border-t border-border", isYou && "bg-saffron-500/5")}>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{isYou ? "You" : m.title}</span>
                        <span className="block text-xs text-muted">{formatIndianNumber(m.subscribers)} subscribers</span>
                      </td>
                      <td className={cn("px-2", i === avgBest && "font-medium text-teal-400")}>{formatIndianNumber(m.avgViews)}</td>
                      <td className={cn("px-2", i === freqBest && "font-medium text-teal-400")}>{m.uploadsPerWeek}</td>
                      <td className="px-2">{Math.round(m.shortsShare * 100)}%</td>
                      <td className={cn("px-2", i === reachBest && "font-medium text-teal-400")}>{m.recentViewsPerSub}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted">
          Views per sub = an average recent upload&apos;s views ÷ subscribers. High means the channel reaches far beyond
          its own subscribers.
        </p>

        <div>
          <p className="text-sm font-medium">Growth</p>
          {anyGrowth ? (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {rows.map((m) => (
                <li key={m.channelId}>
                  <span className="text-white">{data.you && m.channelId === data.you.channelId ? "You" : m.title}:</span>{" "}
                  {growthText(data.growth[m.channelId])}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Growth tracking started today. Open this page again in a few days and the change in subscribers and views
              will show up here.
            </p>
          )}
        </div>
      </Card>

      {data.insights.length > 0 && (
        <Card className="space-y-3">
          <CardTitle>What the numbers say</CardTitle>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {data.insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      )}

      {standouts.length > 0 && (
        <Card className="space-y-3">
          <div>
            <CardTitle>Their best recent videos</CardTitle>
            <CardDescription>
              Study the hook and title — then make your own version. The × shows how much better it did than that
              channel&apos;s usual video.
            </CardDescription>
          </div>
          <div className="space-y-2">
            {standouts.map((v) => (
              <a
                key={v.id}
                href={`https://www.youtube.com/watch?v=${v.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2.5 hover:bg-ink-700"
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm">{v.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {v.channel} · {formatIndianNumber(v.views)} views · {ageLabel(v.ageDays)}
                  </p>
                </div>
                {v.multiplier >= 1.5 && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                    {v.multiplier}×
                  </span>
                )}
              </a>
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <div>
          <CardTitle>Ask the AI about these channels</CardTitle>
          <CardDescription>The AI chat can see all of the numbers above.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {ASK_PROMPTS.map((q) => (
            <Link
              key={q}
              href={`/dashboard/ai-tools?ask=${encodeURIComponent(q)}`}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:bg-ink-800 hover:text-white"
            >
              {q}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
