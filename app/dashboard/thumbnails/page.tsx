"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ThumbnailResult {
  success: boolean;
  base64?: string;
  mimeType?: string;
  provider?: string;
  error?: string;
}

export default function ThumbnailsPage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ThumbnailResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/ai/thumbnail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  const dataUrl = result?.success && result.base64 ? `data:${result.mimeType};base64,${result.base64}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Thumbnail Generator</h1>
        <p className="mt-1 text-sm text-muted">
          Needs an OpenAI or Gemini key in Settings — Groq and Claude don&apos;t do image generation.
        </p>
      </div>

      <Card>
        <form onSubmit={handleGenerate} className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the thumbnail — e.g. a shocked creator pointing at a glowing phone, dark background"
            rows={3}
            className="w-full rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!prompt || loading}>
            {loading ? "Generating… (can take a bit)" : "Generate thumbnail"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted">
          Heads up: image generation uses more of your provider&apos;s credits than text — check
          their pricing if you&apos;re on a paid plan.
        </p>
        {result?.error && <p className="mt-3 text-sm text-red-400">{result.error}</p>}
      </Card>

      {dataUrl && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Result</CardTitle>
            <span className="text-xs text-muted">via {result?.provider}</span>
          </div>
          <CardDescription>1536×1024 — crop to 16:9 in your thumbnail if needed.</CardDescription>
          {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image can't optimize this */}
          <img src={dataUrl} alt="Generated thumbnail" className="mt-4 w-full rounded-md border border-border" />
          <a
            href={dataUrl}
            download="yoinsta-thumbnail.png"
            className="mt-4 inline-block rounded-md bg-saffron-500 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-saffron-400"
          >
            Download
          </a>
        </Card>
      )}
    </div>
  );
}
