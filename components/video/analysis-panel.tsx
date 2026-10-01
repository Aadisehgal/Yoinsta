"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import type { Lang, Verdict, VideoAnalysis } from "@/lib/video-analysis";

interface SeoSection {
  score: number;
  max: number;
}

interface AnalysisResponse {
  seo?: { total: number; title: SeoSection; description: SeoSection; tags: SeoSection };
  analysis: VideoAnalysis | null;
  raw?: string;
  provider?: string;
  error?: string;
}

interface Props {
  videoId: string;
  /** What's currently on screen — including edits that aren't saved yet. */
  draft: { title: string; description: string; tags: string[] };
  onUseTitle: (title: string) => void;
  onUseDescription: (description: string) => void;
  onRemoveTags: (tags: string[]) => void;
  onAddTags: (tags: string[]) => void;
}

const VERDICT_STYLE: Record<Verdict, string> = {
  good: "bg-emerald-500/15 text-emerald-300",
  ok: "bg-amber-500/15 text-amber-300",
  weak: "bg-red-500/15 text-red-300",
};

const VERDICT_LABEL: Record<Verdict, string> = { good: "Good", ok: "Okay", weak: "Needs work" };

function VerdictBadge({ verdict, score }: { verdict: Verdict; score: number }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", VERDICT_STYLE[verdict])}>
      {VERDICT_LABEL[verdict]} · {score}/100
    </span>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function AnalysisPanel({ videoId, draft, onUseTitle, onUseDescription, onRemoveTags, onAddTags }: Props) {
  const [lang, setLang] = useState<Lang>("hinglish");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  async function analyze() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/video-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, draft, lang }),
      });
      const data = (await res.json().catch(() => ({}))) as AnalysisResponse;
      if (!res.ok) {
        setResult(null);
        setNotice({ kind: "error", text: data.error ?? "The review failed. Try again." });
        return;
      }
      setResult(data);
    } catch {
      setNotice({ kind: "error", text: "Network problem — check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  const analysis = result?.analysis ?? null;
  const noKey = notice?.text.toLowerCase().includes("key") ?? false;

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>AI review</CardTitle>
        <CardDescription>
          Checks the title, description and tags you see above — including edits you haven&apos;t saved yet —
          using your own AI key.
        </CardDescription>
      </div>

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
        <Button type="button" onClick={analyze} disabled={loading}>
          {loading ? "Analyzing… (up to a minute)" : result ? "Analyze again" : "Analyze with AI"}
        </Button>
      </div>

      {notice && <NoticeBox notice={notice} />}
      {noKey && (
        <p className="text-sm text-muted">
          <Link href="/dashboard/settings" className="underline underline-offset-4">
            Open Settings
          </Link>{" "}
          to add or re-test your AI key.
        </p>
      )}

      {result && !analysis && result.raw && (
        <div>
          <p className="text-sm text-muted">The AI didn&apos;t return a structured review, so here is its answer as text:</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-ink-950 p-3 text-xs">{result.raw}</pre>
        </div>
      )}

      {analysis && (
        <div className="space-y-6">
          <div className="rounded-md bg-ink-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Overall</p>
              <span className="font-display text-2xl font-medium">{analysis.overallScore}/100</span>
            </div>
            {analysis.summary && <p className="mt-2 text-sm">{analysis.summary}</p>}
            {result?.seo && (
              <p className="mt-3 text-xs text-muted">
                Automatic SEO check: {result.seo.total}/100 (title {result.seo.title.score}/{result.seo.title.max},
                description {result.seo.description.score}/{result.seo.description.max}, tags{" "}
                {result.seo.tags.score}/{result.seo.tags.max})
              </p>
            )}
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">Title</h4>
              <VerdictBadge verdict={analysis.title.verdict} score={analysis.title.score} />
            </div>
            <Bullets items={analysis.title.reasons} />
            {analysis.title.suggestions.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted">Better titles</p>
                {analysis.title.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2">
                    <p className="text-sm">{s}</p>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onUseTitle(s)}>
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">Description</h4>
              <VerdictBadge verdict={analysis.description.verdict} score={analysis.description.score} />
            </div>
            <Bullets items={analysis.description.issues} />
            {analysis.description.improved && (
              <div className="mt-3 rounded-md bg-ink-800 p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Improved description</p>
                <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm">
                  {analysis.description.improved}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => onUseDescription(analysis.description.improved)}
                >
                  Use this description
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h4 className="font-medium">Tags</h4>

            {analysis.tags.remove.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-red-300">Remove ({analysis.tags.remove.length})</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onRemoveTags(analysis.tags.remove.map((t) => t.tag))}
                  >
                    Remove all
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {analysis.tags.remove.map((t) => (
                    <div key={t.tag} className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm">{t.tag}</p>
                        {t.reason && <p className="text-xs text-muted">{t.reason}</p>}
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => onRemoveTags([t.tag])}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.tags.add.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-sky-300">Add ({analysis.tags.add.length})</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onAddTags(analysis.tags.add.map((t) => t.tag))}
                  >
                    Add all
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {analysis.tags.add.map((t) => (
                    <div key={t.tag} className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm">{t.tag}</p>
                        {t.reason && <p className="text-xs text-muted">{t.reason}</p>}
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => onAddTags([t.tag])}>
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.tags.keep.length > 0 && (
              <div>
                <p className="text-sm text-emerald-300">Good to keep ({analysis.tags.keep.length})</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.tags.keep.map((t) => (
                    <span
                      key={t.tag}
                      title={t.reason}
                      className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                    >
                      {t.tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {analysis.quickWins.length > 0 && (
            <section>
              <h4 className="font-medium">Quick wins</h4>
              <Bullets items={analysis.quickWins} />
            </section>
          )}

          <p className="text-xs text-muted">
            Suggestions only change the fields above — nothing is sent to YouTube until you press Save.
          </p>
        </div>
      )}
    </Card>
  );
}
