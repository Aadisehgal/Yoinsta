"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdGate } from "@/components/ad-gate";

interface ScoreSection {
  score: number;
  max: number;
  tips: string[];
}

interface SeoScoreData {
  video: {
    id: string;
    title: string;
    thumbnail: string;
  };
  score: {
    total: number;
    title: ScoreSection;
    description: ScoreSection;
    tags: ScoreSection;
    tips: string[];
  };
}

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("/")[0] || null;
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null;
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export default function SeoToolsPage() {
  const [input, setInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = extractVideoId(input);
    if (!id) {
      setError("Couldn't find a video ID in that — paste a full YouTube URL or the 11-character ID.");
      setVideoId(null);
      return;
    }
    setError(null);
    setVideoId(id);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">SEO Score Checker</h1>
        <p className="mt-1 text-sm text-muted">Paste any YouTube video URL — yours or a competitor's.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!input}>
            Check score
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>

      {videoId && (
        <AdGate resourceKey={`seo:${videoId}`} label="this video's SEO score">
          <SeoResults videoId={videoId} originalInput={input} />
        </AdGate>
      )}
    </div>
  );
}

function SeoResults({ videoId, originalInput }: { videoId: string; originalInput: string }) {
  const [data, setData] = useState<SeoScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/youtube/seo-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: originalInput }),
    })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  if (loading) return <p className="text-sm text-muted">Analyzing…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return null;

  const { video, score } = data;

  return (
    <div className="space-y-4">
      <Card className="items-center py-8 text-center">
        <Image src={video.thumbnail} alt={video.title} width={200} height={112} className="rounded-md" />
        <p className="mt-3 text-sm font-medium">{video.title}</p>
        <p className="mt-4 font-display text-4xl font-medium text-saffron-500">
          {score.total}
          <span className="text-lg text-muted">/100</span>
        </p>
      </Card>

      <Card>
        <CardTitle>Breakdown</CardTitle>
        <div className="mt-4 space-y-3">
          <ScoreBar label="Title" section={score.title} />
          <ScoreBar label="Description" section={score.description} />
          <ScoreBar label="Tags" section={score.tags} />
        </div>
      </Card>

      {score.tips.length > 0 && (
        <Card>
          <CardTitle>How to improve</CardTitle>
          <ul className="mt-3 space-y-2">
            {score.tips.map((tip) => (
              <li key={tip} className="text-sm text-muted">
                • {tip}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ScoreBar({ label, section }: { label: string; section: ScoreSection }) {
  const pct = Math.round((section.score / section.max) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">
          {section.score}/{section.max}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-ink-800">
        <div className="h-2 rounded-full bg-saffron-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
