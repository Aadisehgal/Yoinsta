"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";

interface VideoInfo {
  title: string;
  channel: string;
  avatarUrl: string | null;
}

interface ThumbnailResult {
  success: boolean;
  base64?: string;
  mimeType?: string;
  provider?: string;
  video?: VideoInfo;
  error?: string;
}

const FIELD_CLASS = "w-full rounded-md border border-border bg-ink-950 px-3 py-2";

// Channel icon with a letter-badge fallback, so the slot is never empty or broken.
function ChannelIcon({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-medium text-white">
        {(Array.from(name.trim())[0] ?? "?").toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- channel icon from YouTube's image host, next/image would need extra config
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  );
}

function VideoRow({ video }: { video: VideoInfo }) {
  return (
    <div className="flex items-center gap-3">
      <ChannelIcon src={video.avatarUrl} name={video.channel} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{video.title}</p>
        <p className="truncate text-xs text-muted">{video.channel}</p>
      </div>
    </div>
  );
}

export default function ThumbnailsPage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ThumbnailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptResult, setPromptResult] = useState<{ prompt: string; textOptions: string[] } | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handlePromptOnly() {
    setPromptLoading(true);
    setPromptError(null);
    setPromptResult(null);
    try {
      const res = await fetch("/api/ai/thumbnail-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, prompt }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) setPromptResult({ prompt: data.prompt, textOptions: data.textOptions ?? [] });
      else setPromptError(data?.error ?? "Couldn't write the prompt right now. Try again.");
    } catch {
      setPromptError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setPromptLoading(false);
    }
  }

  async function handleCopy(text: string) {
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/ai/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, prompt }),
      });
      setResult(await res.json());
    } catch {
      setResult({ success: false, error: "Couldn't reach the server — check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  const dataUrl = result?.success && result.base64 ? `data:${result.mimeType};base64,${result.base64}` : null;
  const canSubmit = (videoUrl.trim() !== "" || prompt.trim() !== "") && !loading;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Thumbnail Generator</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a YouTube video link and get a thumbnail built from its title, or just describe one yourself.
          Needs an OpenAI or Gemini key in Settings — Groq and Claude don&apos;t do image generation.
        </p>
      </div>

      <Card>
        <form onSubmit={handleGenerate} className="space-y-3">
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="YouTube video link — e.g. https://youtu.be/abc123"
            className={FIELD_CLASS}
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              videoUrl.trim()
                ? "Optional — extra direction, e.g. red background, shocked face"
                : "Or describe the thumbnail — e.g. a shocked creator pointing at a glowing phone, dark background"
            }
            rows={3}
            className={FIELD_CLASS}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!canSubmit || promptLoading}>
              {loading ? "Generating… (can take a bit)" : "Generate thumbnail"}
            </Button>
            <Button type="button" variant="secondary" onClick={handlePromptOnly} disabled={!canSubmit || promptLoading}>
              {promptLoading ? "Writing prompt…" : "Get a prompt instead"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Heads up: image generation uses more of your provider&apos;s credits than text — check
          their pricing if you&apos;re on a paid plan.
        </p>
        {result?.error && <p className="mt-3 text-sm text-red-400">{result.error}</p>}
      </Card>

      {(promptResult || promptError) && (
        <Card className="space-y-3">
          <CardTitle>Image prompt</CardTitle>
          {promptError && <p className="text-sm text-red-400">{promptError}</p>}
          {promptResult && (
            <>
              <CardDescription>
                Paste this into the Gemini app (free) or any image tool, then upload the picture in Videos → your
                video → Thumbnail.
              </CardDescription>
              <p className="whitespace-pre-wrap rounded-md bg-ink-800 p-3 text-sm">{promptResult.prompt}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => handleCopy(promptResult.prompt)}>
                {copied ? "Copied ✓" : "Copy prompt"}
              </Button>
              {promptResult.textOptions.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Text to add afterwards</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {promptResult.textOptions.map((t) => (
                      <span key={t} className="rounded-full bg-ink-800 px-3 py-1 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Add the words yourself in any editor — image generators often misspell text.
                  </p>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {result?.video && !dataUrl && (
        <Card>
          <VideoRow video={result.video} />
        </Card>
      )}

      {dataUrl && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Result</CardTitle>
            <span className="text-xs text-muted">via {result?.provider}</span>
          </div>
          {result?.provider === "openai" && (
            <CardDescription>1536×1024 — crop to 16:9 in your thumbnail if needed.</CardDescription>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image can't optimize this */}
          <img src={dataUrl} alt="Generated thumbnail" className="mt-4 w-full rounded-md border border-border" />
          {result?.video && (
            <div className="mt-4">
              <VideoRow video={result.video} />
            </div>
          )}
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
