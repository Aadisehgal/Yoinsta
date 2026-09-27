"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "personalized" | "trending";

export default function IdeasPage() {
  const [mode, setMode] = useState<Mode>("personalized");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Daily Ideas</h1>
        <p className="mt-1 text-sm text-muted">Powered by your own AI key — free, no ads, generate as often as you like.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={mode === "personalized"} onClick={() => setMode("personalized")}>
          Personalized
        </TabButton>
        <TabButton active={mode === "trending"} onClick={() => setMode("trending")}>
          Trending
        </TabButton>
      </div>

      {mode === "personalized" ? <PersonalizedIdeas /> : <TrendingIdeas />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm",
        active ? "border-saffron-500 text-white" : "border-transparent text-muted hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function parseIdeas(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function IdeasList({ ideas }: { ideas: string[] }) {
  if (ideas.length === 0) return null;
  return (
    <Card>
      <CardTitle>Ideas</CardTitle>
      <ul className="mt-3 space-y-2">
        {ideas.map((idea, i) => (
          <li key={i} className="rounded-md bg-ink-800 px-3 py-2 text-sm">
            {idea}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PersonalizedIdeas() {
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setIdeas([]);

    const res = await fetch("/api/ai/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "personalized" }),
    });
    const data = await res.json();

    if (data.success) {
      setIdeas(parseIdeas(data.content));
    } else {
      setError(data.error ?? "Something went wrong.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Based on your channel</CardTitle>
        <p className="mt-1 text-sm text-muted">
          Reads your recent videos and stats to suggest what to upload next.
        </p>
        <Button type="button" className="mt-4" onClick={handleGenerate} disabled={loading}>
          {loading ? "Thinking…" : "Generate ideas"}
        </Button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>
      <IdeasList ideas={ideas} />
    </div>
  );
}

function TrendingIdeas() {
  const [topic, setTopic] = useState("");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIdeas([]);

    const res = await fetch("/api/ai/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "trending", topic }),
    });
    const data = await res.json();

    if (data.success) {
      setIdeas(parseIdeas(data.content));
    } else {
      setError(data.error ?? "Something went wrong.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. home workout"
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!topic || loading}>
            {loading ? "Thinking…" : "Generate"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>
      <IdeasList ideas={ideas} />
    </div>
  );
}
