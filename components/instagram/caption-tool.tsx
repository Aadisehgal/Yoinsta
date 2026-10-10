"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import { IG_MAX_HASHTAGS } from "@/lib/instagram-metrics";
import type { CaptionLang, CaptionPack, Tone } from "@/lib/instagram-copy";

interface PackResponse {
  pack: CaptionPack | null;
  raw?: string;
  video?: { title: string };
  error?: string;
}

interface PickableVideo {
  id: string;
  title: string;
}

const inputClass = "w-full rounded-md border border-border bg-ink-950 px-3 py-2 text-sm";

const TONES: { value: Tone; label: string }[] = [
  { value: "fun", label: "Fun" },
  { value: "dramatic", label: "Dramatic" },
  { value: "educational", label: "Educational" },
  { value: "story", label: "Story" },
];

function CopyRow({ text, label, copied, onCopy }: { text: string; label?: string; copied: string | null; onCopy: (t: string) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2">
      <p className="min-w-0 whitespace-pre-wrap break-words text-sm">{text}</p>
      <Button type="button" size="sm" variant="secondary" onClick={() => onCopy(text)}>
        {copied === text ? "Copied ✓" : (label ?? "Copy")}
      </Button>
    </div>
  );
}

export function CaptionTool() {
  const [videoUrl, setVideoUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("fun");
  const [lang, setLang] = useState<CaptionLang>("english");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<PackResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [picking, setPicking] = useState(false);
  const [videos, setVideos] = useState<PickableVideo[] | null>(null);
  const [videosError, setVideosError] = useState<string | null>(null);

  async function togglePicker() {
    const next = !picking;
    setPicking(next);
    if (next && videos === null) {
      try {
        const res = await fetch("/api/youtube/manage/videos");
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.videos)) setVideos(data.videos as PickableVideo[]);
        else setVideosError(data.error ?? "Couldn't load your videos.");
      } catch {
        setVideosError("Couldn't load your videos.");
      }
    }
  }

  async function generate() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/instagram-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, topic, tone, lang }),
      });
      const data = (await res.json().catch(() => ({}))) as PackResponse;
      if (!res.ok) {
        setResult(null);
        setNotice({ kind: "error", text: data.error ?? "Couldn't write the caption. Try again." });
        return;
      }
      setResult(data);
    } catch {
      setNotice({ kind: "error", text: "Network problem or it took too long — try again." });
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    const ok = await copyText(text);
    setCopied(ok ? text : null);
    setTimeout(() => setCopied(null), 1800);
  }

  const pack = result?.pack ?? null;
  const keyProblem = notice?.text.toLowerCase().includes("key") ?? false;
  const canWrite = (videoUrl.trim() || topic.trim()) && !loading;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <CardTitle>Caption &amp; hashtag maker</CardTitle>
          <CardDescription>
            Paste a YouTube link (like a Short you want to post as a Reel) and/or say what the post is about. You get
            opening lines, a caption, hashtags (Instagram allows at most {IG_MAX_HASHTAGS}), cover text and a CTA.
          </CardDescription>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="ig-video">
            YouTube link (optional)
          </label>
          <input
            id="ig-video"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/shorts/…"
            className={inputClass}
          />
          <button type="button" onClick={togglePicker} className="text-xs text-saffron-400 underline underline-offset-4">
            {picking ? "Hide my videos" : "Or pick one of my videos"}
          </button>
          {picking && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {videos === null && !videosError && <p className="p-2 text-xs text-muted">Loading…</p>}
              {videosError && <p className="p-2 text-xs text-red-400">{videosError}</p>}
              {videos?.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVideoUrl(`https://youtube.com/watch?v=${v.id}`);
                    setPicking(false);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-ink-800"
                >
                  {v.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ig-topic">
            What is the post about? (optional)
          </label>
          <textarea
            id="ig-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="e.g. An egg cracks open and a giant robotic wasp climbs out"
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className={cn(inputClass, "w-auto")} aria-label="Tone">
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} tone
              </option>
            ))}
          </select>
          <select value={lang} onChange={(e) => setLang(e.target.value as CaptionLang)} className={cn(inputClass, "w-auto")} aria-label="Caption language">
            <option value="english">Write in English</option>
            <option value="hinglish">Write in Hinglish</option>
          </select>
        </div>

        <Button type="button" onClick={generate} disabled={!canWrite}>
          {loading ? "Writing… (up to a minute)" : pack ? "Write again" : "Write my caption"}
        </Button>

        {notice && <NoticeBox notice={notice} />}
        {keyProblem && (
          <p className="text-sm text-muted">
            <Link href="/dashboard/settings" className="underline underline-offset-4">
              Open Settings
            </Link>{" "}
            to add or re-test your AI key.
          </p>
        )}
      </Card>

      {result && !pack && result.raw && (
        <Card>
          <p className="text-sm text-muted">The AI didn&apos;t return a structured answer, so here it is as text:</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-ink-950 p-3 text-xs">{result.raw}</pre>
        </Card>
      )}

      {pack && (
        <Card className="space-y-6">
          {result?.video && <p className="text-xs text-muted">For: {result.video.title}</p>}

          <section className="space-y-2">
            <h4 className="font-medium">Ready to paste</h4>
            <div className="rounded-md bg-ink-800 p-3">
              <p className="whitespace-pre-wrap break-words text-sm">{pack.fullText}</p>
              <Button type="button" size="sm" className="mt-3" onClick={() => copy(pack.fullText)}>
                {copied === pack.fullText ? "Copied ✓" : "Copy caption + hashtags"}
              </Button>
            </div>
          </section>

          {pack.hooks.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-medium">Opening line options</h4>
              <p className="text-xs text-muted">Only the first line shows before &ldquo;more&rdquo; — pick the one that stops the scroll.</p>
              {pack.hooks.map((h) => (
                <CopyRow key={h} text={h} copied={copied} onCopy={copy} />
              ))}
            </section>
          )}

          {pack.hashtags.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-medium">
                  Hashtags ({pack.hashtags.length}/{IG_MAX_HASHTAGS})
                </h4>
                <Button type="button" size="sm" variant="secondary" onClick={() => copy(pack.hashtags.map((t) => `#${t}`).join(" "))}>
                  {copied === pack.hashtags.map((t) => `#${t}`).join(" ") ? "Copied ✓" : "Copy all"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {pack.hashtags.map((t) => (
                  <span key={t} className="rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
                    #{t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {pack.coverText.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-medium">Cover text</h4>
              {pack.coverText.map((c) => (
                <CopyRow key={c} text={c} copied={copied} onCopy={copy} />
              ))}
            </section>
          )}

          {pack.cta && (
            <section className="space-y-2">
              <h4 className="font-medium">Call to action</h4>
              <CopyRow text={pack.cta} copied={copied} onCopy={copy} />
            </section>
          )}

          {pack.altText && (
            <section className="space-y-2">
              <h4 className="font-medium">Alt text</h4>
              <CopyRow text={pack.altText} copied={copied} onCopy={copy} />
            </section>
          )}
        </Card>
      )}
    </div>
  );
}
