"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AiToolsPage() {
  const [topic, setTopic] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTitles([]);

    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "titles", topic }),
    });
    const data = await res.json();

    if (data.success) {
      const lines = (data.content as string)
        .split("\n")
        .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      setTitles(lines);
    } else {
      setError(data.error ?? "Something went wrong.");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Title generator</h1>
        <p className="mt-1 text-sm text-muted">
          Powered by your own AI key — add one in Settings first if you haven&apos;t.
        </p>
      </div>

      <Card>
        <form onSubmit={handleGenerate} className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What's the video about?"
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!topic || loading}>
            {loading ? "Generating…" : "Generate 5 titles"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>

      {titles.length > 0 && (
        <Card>
          <CardTitle>Suggestions</CardTitle>
          <ul className="mt-3 space-y-2">
            {titles.map((t, i) => (
              <li key={i} className="rounded-md bg-ink-800 px-3 py-2 text-sm">
                {t}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
