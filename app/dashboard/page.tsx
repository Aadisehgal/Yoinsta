"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Youtube } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { formatIndianNumber } from "@/lib/utils";

interface DashboardResponse {
  connected: boolean;
  channel?: {
    title: string;
    thumbnail: string;
    subscriberCount: number;
    videoCount: number;
  };
  analytics?: {
    totalViews28d: number;
    totalWatchMinutes28d: number;
    subscribersGained28d: number;
    daily: { date: string; views: number }[];
  };
  error?: string;
}

interface VideoStats {
  id: string;
  title: string;
  thumbnail: string;
  views: number;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-14 w-64 animate-pulse rounded-lg bg-ink-800" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-ink-800" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-ink-800" />
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [videos, setVideos] = useState<VideoStats[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [dashRes, vidRes] = await Promise.all([
      fetch("/api/youtube/dashboard").then((r) => r.json()),
      fetch("/api/youtube/videos").then((r) => r.json()),
    ]);
    setData(dashRes);
    setVideos(vidRes.videos ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (!data?.connected) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <Card className="items-center py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-800">
            <Youtube className="text-platform-youtube" size={22} />
          </div>
          <CardTitle>Connect your YouTube channel</CardTitle>
          <CardDescription>
            Views, subscribers, watch time, and your top videos will show up here once you connect.
          </CardDescription>
          <a href="/api/youtube/connect">
            <Button className="mt-6">Connect YouTube</Button>
          </a>
        </Card>
      </div>
    );
  }

  const { channel, analytics } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {channel?.thumbnail && (
            <Image
              src={channel.thumbnail}
              alt={channel.title}
              width={48}
              height={48}
              className="rounded-full"
            />
          )}
          <div>
            <h1 className="font-display text-xl font-medium">{channel?.title}</h1>
            <p className="text-sm text-muted">
              {formatIndianNumber(channel?.subscriberCount ?? 0)} subscribers
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {data.error && <p className="text-sm text-red-400">{data.error}</p>}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Views (28d)" value={formatIndianNumber(analytics?.totalViews28d ?? 0)} />
        <StatCard
          label="Watch time (28d)"
          value={`${formatIndianNumber(Math.round((analytics?.totalWatchMinutes28d ?? 0) / 60))} hrs`}
        />
        <StatCard
          label="Subscribers gained (28d)"
          value={formatIndianNumber(analytics?.subscribersGained28d ?? 0)}
        />
        <StatCard label="Total videos" value={formatIndianNumber(channel?.videoCount ?? 0)} />
      </div>

      <Card>
        <CardTitle>Daily views — last 28 days</CardTitle>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics?.daily ?? []}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#8A93AD" }}
                stroke="#2A314A"
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis tick={{ fontSize: 11, fill: "#8A93AD" }} stroke="#2A314A" />
              <Tooltip contentStyle={{ background: "#1E2438", border: "1px solid #2A314A" }} />
              <Line type="monotone" dataKey="views" stroke="#F5A524" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>Top videos</CardTitle>
        <div className="mt-4 space-y-2">
          {videos.slice(0, 5).map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <Image
                src={v.thumbnail}
                alt={v.title}
                width={64}
                height={40}
                className="rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{v.title}</p>
                <p className="text-xs text-muted">{formatIndianNumber(v.views)} views</p>
              </div>
            </div>
          ))}
          {videos.length === 0 && <p className="text-sm text-muted">No videos found yet.</p>}
        </div>
      </Card>
    </div>
  );
}
