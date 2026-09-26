"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdGate } from "@/components/ad-gate";
import { formatIndianNumber } from "@/lib/utils";

interface OutlierVideo {
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

function multiplierColor(multiplier: number): string {
  if (multiplier >= 20) return "bg-red-500/20 text-red-400";
  if (multiplier >= 8) return "bg-saffron-500/20 text-saffron-400";
  if (multiplier >= 3) return "bg-teal-500/20 text-teal-400";
  return "bg-ink-800 text-muted";
}

export default function OutliersPage() {
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) setTopic(trimmed);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Outlier Video Finder</h1>
        <p className="mt-1 text-sm text-muted">
          Videos that massively out-performed their own channel&apos;s normal average — proven
          formats worth studying.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. reels editing tutorial"
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!input}>
            Search
          </Button>
        </form>
      </Card>

      {topic && (
        <AdGate resourceKey={`outliers:${topic.toLowerCase()}`} label={`outliers for "${topic}"`}>
          <OutlierResults topic={topic} />
        </AdGate>
      )}
    </div>
  );
}

function OutlierResults({ topic }: { topic: string }) {
  const [videos, setVideos] = useState<OutlierVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/youtube/outliers?q=${encodeURIComponent(topic)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setVideos(d.videos ?? [])))
      .finally(() => setLoading(false));
  }, [topic]);

  if (loading) return <p className="text-sm text-muted">Searching…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;

  if (videos.length === 0) {
    return <p className="text-sm text-muted">No results found for this topic.</p>;
  }

  return (
    <Card>
      <CardTitle>Results, sorted by multiplier</CardTitle>
      <CardDescription>
        Multiplier = video views ÷ that channel&apos;s average views per video.
      </CardDescription>
      <div className="mt-4 space-y-2">
        {videos.map((v) => (
          <a
            key={v.id}
            href={`https://youtube.com/watch?v=${v.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-ink-800"
          >
            <Image src={v.thumbnail} alt={v.title} width={64} height={40} className="rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{v.title}</p>
              <p className="text-xs text-muted">
                {v.channelTitle} · {formatIndianNumber(v.views)} views (channel avg{" "}
                {formatIndianNumber(v.channelAvgViews)})
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${multiplierColor(v.multiplier)}`}>
              {v.multiplier}x
            </span>
          </a>
        ))}
      </div>
    </Card>
  );
}
