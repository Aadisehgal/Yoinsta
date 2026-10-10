"use client";

import { useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatIndianNumber } from "@/lib/utils";
import { primaryMetric } from "@/lib/instagram-metrics";
import type { AccountInsights, IgPost, IgProfile, IgSummary, PostType } from "@/lib/instagram-metrics";

export interface OverviewData {
  profile: IgProfile;
  account: AccountInsights | null;
  posts: IgPost[];
  summary: IgSummary;
  insights: string[];
  followerGrowth: { days: number; subs: number } | null;
  generatedAt: string;
}

const TYPE_LABEL: Record<PostType, string> = { REEL: "Reel", CAROUSEL: "Carousel", IMAGE: "Photo", VIDEO: "Video" };

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-ink-800 px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-display text-lg font-medium">{value === null ? "—" : formatIndianNumber(value)}</p>
    </div>
  );
}

function dateLabel(iso: string): string {
  const d = new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function PostRow({ post, multiplier }: { post: IgPost; multiplier: number | null }) {
  const video = post.type === "REEL" || post.type === "VIDEO";
  const main = video ? (post.views ?? post.reach) : (post.reach ?? post.views);
  const mainLabel = video && post.views !== null ? "views" : "reach";
  return (
    <a
      href={post.permalink || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-lg border border-border bg-ink-900 p-3 transition-colors hover:bg-ink-800"
    >
      {post.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          className="h-20 w-16 shrink-0 rounded-md bg-ink-950 object-cover"
        />
      ) : (
        <div className="h-20 w-16 shrink-0 rounded-md bg-ink-800" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded bg-ink-800 px-1.5 py-0.5">{TYPE_LABEL[post.type]}</span>
          <span>{dateLabel(post.timestamp)}</span>
          {multiplier !== null && multiplier >= 3 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">{multiplier}×</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm">{post.caption.trim() || "(no caption)"}</p>
        <p className="mt-1 text-xs text-muted">
          <span className="text-white">
            {main === null ? "—" : formatIndianNumber(main)} {mainLabel}
          </span>
          {" · "}
          {formatIndianNumber(post.likes)} likes · {formatIndianNumber(post.comments)} comments
          {post.shares !== null && ` · ${formatIndianNumber(post.shares)} shares`}
          {post.saved !== null && ` · ${formatIndianNumber(post.saved)} saves`}
          {post.skipRate !== null && ` · ${post.skipRate}% skip`}
        </p>
      </div>
    </a>
  );
}

export function OverviewPanel({
  data,
  refreshing,
  onRefresh,
  onDisconnect,
}: {
  data: OverviewData;
  refreshing: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const { profile, account, posts, summary, insights, followerGrowth } = data;
  const [showAll, setShowAll] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const multiplierById = new Map(summary.outliers.map((o) => [o.post.id, o.multiplier]));
  const sorted = [...posts].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const shown = showAll ? sorted : sorted.slice(0, 8);
  const best = [...posts].sort((a, b) => primaryMetric(b) - primaryMetric(a)).slice(0, 3);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          {profile.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full bg-ink-950 object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-800 text-xl">
              {profile.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-medium">@{profile.username}</p>
            {profile.name && <p className="truncate text-sm text-muted">{profile.name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Followers" value={profile.followers} />
          <Stat label="Following" value={profile.following} />
          <Stat label="Posts" value={profile.mediaCount} />
        </div>
        <p className="text-xs text-muted">
          {followerGrowth
            ? `Followers over ~${followerGrowth.days} days: ${followerGrowth.subs > 0 ? "+" : ""}${formatIndianNumber(followerGrowth.subs)}`
            : "Follower growth tracking started today — the change shows up after about a week."}
        </p>
      </Card>

      {account && (
        <Card className="space-y-3">
          <div>
            <CardTitle>Last {account.days} days</CardTitle>
            <CardDescription>Across everything you posted.</CardDescription>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Reach" value={account.reach} />
            <Stat label="Views" value={account.views} />
            <Stat label="Accounts engaged" value={account.accountsEngaged} />
            <Stat label="Interactions" value={account.totalInteractions} />
          </div>
        </Card>
      )}

      {insights.length > 0 && (
        <Card className="space-y-3">
          <CardTitle>What the numbers say</CardTitle>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      )}

      {summary.byType.length > 0 && (
        <Card className="space-y-3">
          <div>
            <CardTitle>Which format works</CardTitle>
            <CardDescription>Average per post — views for videos and Reels, reach for photos and carousels.</CardDescription>
          </div>
          <div className="space-y-2">
            {summary.byType.map((t, i) => (
              <div key={t.type} className={cn("flex items-center justify-between rounded-md bg-ink-800 px-3 py-2 text-sm", i === 0 && "ring-1 ring-teal-500/50")}>
                <span>
                  {TYPE_LABEL[t.type]} <span className="text-xs text-muted">× {t.count}</span>
                </span>
                <span>
                  <span className="font-medium">{formatIndianNumber(t.avgPrimary)}</span>
                  {t.avgEngagementRate !== null && <span className="ml-2 text-xs text-muted">{t.avgEngagementRate}% engaged</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {best.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-sm font-medium">Your best posts</h3>
          {best.map((p) => (
            <PostRow key={p.id} post={p} multiplier={multiplierById.get(p.id) ?? null} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="px-1 text-sm font-medium">Recent posts</h3>
        {shown.map((p) => (
          <PostRow key={p.id} post={p} multiplier={multiplierById.get(p.id) ?? null} />
        ))}
        {sorted.length > 8 && (
          <Button type="button" variant="secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${sorted.length}`}
          </Button>
        )}
        {posts.length === 0 && <p className="text-sm text-muted">No posts found on this account yet.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh numbers"}
        </Button>
        {confirmDisconnect ? (
          <>
            <Button type="button" variant="destructive" onClick={onDisconnect}>
              Yes, disconnect
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirmDisconnect(true)}>
            Disconnect Instagram
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        Numbers come straight from Instagram and are saved for a few minutes to stay within its limits.
      </p>
    </div>
  );
}
