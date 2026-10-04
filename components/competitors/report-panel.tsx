"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import type { CompetitorReport, Standing } from "@/lib/competitor-report";
import type { Lang } from "@/lib/video-analysis";

interface ReportResponse {
  report: CompetitorReport | null;
  raw?: string;
  error?: string;
}

const STANDING_STYLE: Record<Standing, string> = {
  behind: "bg-red-500/15 text-red-300",
  similar: "bg-amber-500/15 text-amber-300",
  ahead: "bg-emerald-500/15 text-emerald-300",
};

const STANDING_LABEL: Record<Standing, string> = {
  behind: "Behind them",
  similar: "About level",
  ahead: "Ahead of them",
};

function Bullets({ items, tone }: { items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("mt-1 list-disc space-y-1 pl-5 text-sm", tone ?? "text-muted")}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function ReportPanel({ hasCompetitors }: { hasCompetitors: boolean }) {
  const [lang, setLang] = useState<Lang>("hinglish");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/competitor-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const data = (await res.json().catch(() => ({}))) as ReportResponse;
      if (!res.ok) {
        setResult(null);
        setNotice({ kind: "error", text: data.error ?? "The report failed. Try again." });
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

  const report = result?.report ?? null;
  const keyProblem = notice?.text.toLowerCase().includes("key") ?? false;

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>AI competitor report</CardTitle>
        <CardDescription>
          The AI reads your numbers and your competitors&apos; recent videos, then tells you what works for them, what
          you&apos;re missing, and what to make next. Uses your own AI key.
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
        <Button type="button" onClick={run} disabled={loading || !hasCompetitors}>
          {loading ? "Analyzing… (up to a minute)" : result ? "Run again" : "Analyze my competitors"}
        </Button>
      </div>
      {!hasCompetitors && <p className="text-xs text-muted">Add at least one competitor above first.</p>}

      {notice && <NoticeBox notice={notice} />}
      {keyProblem && (
        <p className="text-sm text-muted">
          <Link href="/dashboard/settings" className="underline underline-offset-4">
            Open Settings
          </Link>{" "}
          to add or re-test your AI key.
        </p>
      )}

      {result && !report && result.raw && (
        <div>
          <p className="text-sm text-muted">The AI didn&apos;t return a structured report, so here is its answer as text:</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-ink-950 p-3 text-xs">{result.raw}</pre>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <div className="rounded-md bg-ink-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Where you stand</p>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STANDING_STYLE[report.standing.verdict])}>
                {STANDING_LABEL[report.standing.verdict]}
              </span>
            </div>
            {report.summary && <p className="mt-2 text-sm">{report.summary}</p>}
            <Bullets items={report.standing.points} />
          </div>

          {report.competitors.length > 0 && (
            <section className="space-y-3">
              <h4 className="font-medium">What each competitor does</h4>
              {report.competitors.map((c) => (
                <div key={c.name} className="rounded-md bg-ink-800 p-3">
                  <p className="font-medium">{c.name}</p>
                  {c.whyTheyWork && <p className="mt-1 text-sm text-muted">{c.whyTheyWork}</p>}
                  {c.pattern && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Pattern: </span>
                      {c.pattern}
                    </p>
                  )}
                  {c.copy.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs uppercase tracking-wide text-emerald-300">Adapt this</p>
                      <Bullets items={c.copy} tone="text-white" />
                    </div>
                  )}
                  {c.avoid.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs uppercase tracking-wide text-amber-300">Don&apos;t copy</p>
                      <Bullets items={c.avoid} />
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {report.gaps.length > 0 && (
            <section>
              <h4 className="font-medium">What you&apos;re missing</h4>
              <Bullets items={report.gaps} tone="text-white" />
            </section>
          )}

          {report.ideas.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-medium">5 video ideas from their results</h4>
              {report.ideas.map((idea, i) => (
                <div key={i} className="rounded-md bg-ink-800 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{idea.title}</p>
                    <Button type="button" size="sm" variant="secondary" onClick={() => copy(idea.title)}>
                      {copied === idea.title ? "Copied ✓" : "Copy"}
                    </Button>
                  </div>
                  {idea.why && <p className="mt-1 text-sm text-muted">{idea.why}</p>}
                  {idea.hook && (
                    <p className="mt-1 text-sm">
                      <span className="text-amber-300">First 3 seconds: </span>
                      {idea.hook}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {report.thisWeek.length > 0 && (
            <section>
              <h4 className="font-medium">Do this week</h4>
              <Bullets items={report.thisWeek} tone="text-white" />
            </section>
          )}

          <p className="text-xs text-muted">
            Based on public numbers only — you can&apos;t see a competitor&apos;s watch time or revenue. Use it as a
            direction, then test.
          </p>
        </div>
      )}
    </Card>
  );
}
