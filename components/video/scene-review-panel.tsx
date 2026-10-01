"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import type { Lang, Verdict } from "@/lib/video-analysis";
import type { SceneReview } from "@/lib/scene-review";

interface ReviewResponse {
  review: SceneReview | null;
  raw?: string;
  model?: string;
  clippedToSeconds?: number;
  error?: string;
  code?: string;
}

const VERDICT_STYLE: Record<Verdict, string> = {
  good: "bg-emerald-500/15 text-emerald-300",
  ok: "bg-amber-500/15 text-amber-300",
  weak: "bg-red-500/15 text-red-300",
};

function scoreStyle(score: number): string {
  return score >= 75 ? VERDICT_STYLE.good : score >= 50 ? VERDICT_STYLE.ok : VERDICT_STYLE.weak;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    const ok = await copyText(text);
    setState(ok ? "done" : "failed");
    setTimeout(() => setState("idle"), 1800);
  }
  return (
    <Button type="button" size="sm" variant="secondary" onClick={copy}>
      {state === "done" ? "Copied ✓" : state === "failed" ? "Couldn't copy" : label}
    </Button>
  );
}

export function SceneReviewPanel({ videoId, isPublic, privacy }: { videoId: string; isPublic: boolean; privacy: string }) {
  const [lang, setLang] = useState<Lang>("hinglish");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);

  async function run() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/video-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, lang }),
      });
      const data = (await res.json().catch(() => ({}))) as ReviewResponse;
      if (!res.ok) {
        setResult(null);
        setNotice({ kind: "error", text: data.error ?? "The review failed. Try again.", code: data.code });
        return;
      }
      setResult(data);
    } catch {
      setNotice({ kind: "error", text: "Network problem or it took too long — try again." });
    } finally {
      setLoading(false);
    }
  }

  const review = result?.review ?? null;
  const allPrompts = review?.nextVideo.prompts.map((p) => `Scene ${p.scene}${p.time ? ` (${p.time})` : ""}: ${p.prompt}`).join("\n\n") ?? "";
  const keyProblem = notice?.text.toLowerCase().includes("gemini key") || notice?.text.toLowerCase().includes("api key");

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Scene-by-scene review</CardTitle>
        <CardDescription>
          Gemini actually watches this video, tells you what works and what loses viewers in each scene, suggests
          which animal to make next, and writes ready-to-paste prompts. Needs a Gemini key and a Public video.
        </CardDescription>
      </div>

      {!isPublic && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          This video is {privacy}. Gemini can only watch Public videos — set it to Public (and save) first.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          disabled={loading}
          className="rounded-md border border-border bg-ink-950 px-3 py-2 text-sm"
          aria-label="Explanation language"
        >
          <option value="hinglish">Explain in Hinglish</option>
          <option value="english">Explain in English</option>
        </select>
        <Button type="button" onClick={run} disabled={loading || !isPublic}>
          {loading ? "Gemini is watching… (up to a minute)" : result ? "Review again" : "Watch & review this video"}
        </Button>
      </div>

      {notice && <NoticeBox notice={notice} />}
      {keyProblem && (
        <p className="text-sm text-muted">
          <Link href="/dashboard/settings" className="underline underline-offset-4">
            Open Settings
          </Link>{" "}
          to add or re-test your Gemini key.
        </p>
      )}

      {result && !review && result.raw && (
        <div>
          <p className="text-sm text-muted">Gemini didn&apos;t return a structured review, so here is its answer as text:</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-ink-950 p-3 text-xs">{result.raw}</pre>
        </div>
      )}

      {review && (
        <div className="space-y-6">
          {result?.clippedToSeconds ? (
            <p className="text-xs text-muted">
              Long video — only the first {Math.round(result.clippedToSeconds / 60)} minutes were reviewed.
            </p>
          ) : null}

          {review.summary && <p className="rounded-md bg-ink-800 p-4 text-sm">{review.summary}</p>}

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">First 3 seconds (hook)</h4>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", VERDICT_STYLE[review.hook.verdict])}>
                {review.hook.score}/100
              </span>
            </div>
            {review.hook.whatHappens && <p className="mt-2 text-sm text-muted">{review.hook.whatHappens}</p>}
            {review.hook.fix && (
              <p className="mt-2 text-sm">
                <span className="text-amber-300">Fix: </span>
                {review.hook.fix}
              </p>
            )}
          </section>

          {review.scenes.length > 0 && (
            <section>
              <h4 className="font-medium">Scene by scene</h4>
              <div className="mt-3 space-y-3">
                {review.scenes.map((s, i) => (
                  <div key={i} className="rounded-md bg-ink-800 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-ink-950 px-2 py-0.5 font-mono text-xs">
                        {s.start || "?"}–{s.end || "?"}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", scoreStyle(s.score))}>{s.score}/100</span>
                    </div>
                    <p className="mt-2 text-sm">{s.what}</p>
                    {s.works && (
                      <p className="mt-1 text-sm text-emerald-300">
                        <span className="font-medium">Works: </span>
                        {s.works}
                      </p>
                    )}
                    {s.problem && (
                      <p className="mt-1 text-sm text-amber-300">
                        <span className="font-medium">Improve: </span>
                        {s.problem}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(review.pacing || review.soundAndText) && (
            <section className="space-y-2 text-sm">
              {review.pacing && (
                <p>
                  <span className="font-medium">Pacing: </span>
                  <span className="text-muted">{review.pacing}</span>
                </p>
              )}
              {review.soundAndText && (
                <p>
                  <span className="font-medium">Sound &amp; text: </span>
                  <span className="text-muted">{review.soundAndText}</span>
                </p>
              )}
            </section>
          )}

          {review.retentionRisks.length > 0 && (
            <section>
              <h4 className="font-medium">Where viewers may leave</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {review.retentionRisks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {(review.nextVideo.animal || review.nextVideo.prompts.length > 0) && (
            <section className="space-y-3 rounded-md border border-border p-4">
              <h4 className="font-medium">Your next video</h4>
              {review.nextVideo.animal && (
                <p className="font-display text-xl font-medium">{review.nextVideo.animal}</p>
              )}
              {review.nextVideo.why && <p className="text-sm text-muted">{review.nextVideo.why}</p>}
              {review.nextVideo.title && (
                <div className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2">
                  <p className="text-sm">{review.nextVideo.title}</p>
                  <CopyButton text={review.nextVideo.title} />
                </div>
              )}
              {review.nextVideo.concept && <p className="text-sm">{review.nextVideo.concept}</p>}

              {review.nextVideo.prompts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Prompts, scene by scene</p>
                    <CopyButton text={allPrompts} label="Copy all" />
                  </div>
                  {review.nextVideo.prompts.map((p) => (
                    <div key={p.scene} className="rounded-md bg-ink-800 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted">
                          Scene {p.scene}
                          {p.time ? ` · ${p.time}` : ""}
                        </span>
                        <CopyButton text={p.prompt} />
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{p.prompt}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <p className="text-xs text-muted">
            Based on what Gemini saw and heard in the video. It can miss small details — treat it as a second opinion.
          </p>
        </div>
      )}
    </Card>
  );
}
