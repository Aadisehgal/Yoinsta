"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdGate } from "@/components/ad-gate";
import { formatIndianNumber } from "@/lib/utils";

interface Suggestion {
  keyword: string;
  popularityRank: number;
}

interface TopVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  views: number;
}

interface KeywordData {
  topic: string;
  suggestions: Suggestion[];
  competition: {
    avgViews: number;
    sampledVideos: number;
    uniqueChannels: number;
    competitionScore: number;
    opportunityScore: number;
  };
  topVideos: TopVideo[];
}

export default function KeywordsPage() {
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
        <h1 className="font-display text-2xl font-medium">Keyword Research</h1>
        <p className="mt-1 text-sm text-muted">See what people search for and how hard it&apos;d be to rank.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. how to edit reels"
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!input}>
            Research
          </Button>
        </form>
      </Card>

      {topic && (
        <AdGate resourceKey={`keywords:${topic.toLowerCase()}`} label={`keyword ideas for "${topic}"`}>
          <KeywordResults topic={topic} />
        </AdGate>
      )}
    </div>
  );
}

function KeywordResults({ topic }: { topic: string }) {
  const [data, setData] = useState<KeywordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/youtube/keywords?q=${encodeURIComponent(topic)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .finally(() => setLoading(false));
  }, [topic]);

  if (loading) return <p className="text-sm text-muted">Researching…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Opportunity</CardTitle>
        <CardDescription>
          Estimated from this topic&apos;s top-ranking videos — not official Google Trends data.
        </CardDescription>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted">Opportunity score</p>
            <p className="font-display text-2xl font-medium text-teal-400">
              {data.competition.opportunityScore}/100
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Competition score</p>
            <p className="font-display text-2xl font-medium text-saffron-500">
              {data.competition.competitionScore}/100
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Avg views of top {data.competition.sampledVideos} results: {formatIndianNumber(data.competition.avgViews)}{" "}
          · {data.competition.uniqueChannels} unique channels
        </p>
      </Card>

      <Card>
        <CardTitle>Related searches</CardTitle>
        <ul className="mt-3 space-y-2">
          {data.suggestions.map((s) => (
            <li
              key={s.keyword}
              className="flex items-center justify-between rounded-md bg-ink-800 px-3 py-2 text-sm"
            >
              <span>{s.keyword}</span>
              <span className="text-xs text-muted">#{s.popularityRank}</span>
            </li>
          ))}
          {data.suggestions.length === 0 && <p className="text-sm text-muted">No suggestions found.</p>}
        </ul>
      </Card>

      <Card>
        <CardTitle>Top-ranking videos</CardTitle>
        <div className="mt-3 space-y-2">
          {data.topVideos.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <Image src={v.thumbnail} alt={v.title} width={64} height={40} className="rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{v.title}</p>
                <p className="text-xs text-muted">
                  {v.channelTitle} · {formatIndianNumber(v.views)} views
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
