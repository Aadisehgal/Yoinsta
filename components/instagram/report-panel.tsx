"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import type { IgVerdict, InstagramReport } from "@/lib/instagram-copy";
import type { Lang } from "@/lib/video-analysis";

interface ReportResponse {
  report: InstagramReport | null;
  raw?: string;
  error?: string;
  code?: string;
}

const VERDICT_STYLE: Record<IgVerdict, string> = {
  weak: "bg-red-500/15 text-red-300",
  okay: "bg-amber-500/15 text-amber-300",
  strong: "bg-emerald-500/15 text-emerald-300",
};
const VERDICT_LABEL: Record<IgVerdict, string> = { weak: "Needs work", okay: "Okay", strong: "Strong" };

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

export function IgReportPanel() {
  const [lang, setLang] = useState<Lang>("hinglish");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/instagram-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, tz: -new Date().getTimezoneOffset() }),
      });
      const data = (await res.json().catch(() => ({}))) as ReportResponse;
      if (!res.ok) {
        setResult(null);
        setNotice({ kind: "error", text: data.error ?? "The report failed. Try again.", code: data.code === "needs_reconnect" ? undefined : data.code });
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
        <CardTitle>AI Instagram report</CardTitle>
        <CardDescription>
          The AI reads your posts and numbers, then tells you what works, what to fix, and what to post next. Uses your own AI key.
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
        <Button type="button" onClick={run} disabled={loading}>
          {loading ? "Analyzing… (up to a minute)" : result ? "Run again" : "Analyze my Instagram"}
        </Button>
      </div>

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
              <p className="text-sm text-muted">How it&apos;s going</p>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", VERDICT_STYLE[report.standing.verdict])}>
                {VERDICT_LABEL[report.standing.verdict]}
              </span>
            </div>
            {report.summary && <p className="mt-2 text-sm">{report.summary}</p>}
            <Bullets items={report.standing.points} />
          </div>

          {report.whatWorks.length > 0 && (
            <section>
              <h4 className="font-medium text-emerald-300">What works</h4>
              <Bullets items={report.whatWorks} tone="text-white" />
            </section>
          )}
          {report.whatToFix.length > 0 && (
            <section>
              <h4 className="font-medium text-amber-300">What to fix</h4>
              <Bullets items={report.whatToFix} tone="text-white" />
            </section>
          )}
          {(report.formatAdvice || report.bestTime) && (
            <section className="space-y-2 text-sm">
              {report.formatAdvice && (
                <p>
                  <span className="font-medium">Format: </span>
                  <span className="text-muted">{report.formatAdvice}</span>
                </p>
              )}
              {report.bestTime && (
                <p>
                  <span className="font-medium">When to post: </span>
                  <span className="text-muted">{report.bestTime}</span>
                </p>
              )}
            </section>
          )}

          {report.hooks.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-medium">Opening lines to try</h4>
              {report.hooks.map((h, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-md bg-ink-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm">{h.line}</p>
                    {h.why && <p className="mt-0.5 text-xs text-muted">{h.why}</p>}
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => copy(h.line)}>
                    {copied === h.line ? "Copied ✓" : "Copy"}
                  </Button>
                </div>
              ))}
            </section>
          )}

          {report.ideas.length > 0 && (
            <section className="space-y-2">
              <h4 className="font-medium">5 posts to make next</h4>
              {report.ideas.map((idea, i) => {
                const full = [idea.caption, idea.hashtags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
                return (
                  <div key={i} className="rounded-md bg-ink-800 p-3">
                    <p className="text-sm font-medium">{idea.title}</p>
                    {idea.hook && (
                      <p className="mt-1 text-sm">
                        <span className="text-amber-300">First 3 seconds: </span>
                        {idea.hook}
                      </p>
                    )}
                    {idea.caption && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{idea.caption}</p>}
                    {idea.hashtags.length > 0 && <p className="mt-1 text-xs text-sky-300">{idea.hashtags.map((t) => `#${t}`).join(" ")}</p>}
                    {full && (
                      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => copy(full)}>
                        {copied === full ? "Copied ✓" : "Copy caption"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {report.thisWeek.length > 0 && (
            <section>
              <h4 className="font-medium">Do this week</h4>
              <Bullets items={report.thisWeek} tone="text-white" />
            </section>
          )}
          <p className="text-xs text-muted">Based on your last posts only — a small sample. Use it as a direction, then test.</p>
        </div>
      )}
    </Card>
  );
}
