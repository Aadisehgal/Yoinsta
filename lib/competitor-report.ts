// Prompt + reply-cleaning for the "AI competitor report". Pure (no network); reuses the same tolerant
// helpers as the video review so a slightly messy model reply still turns into something usable.

import { LANG_RULE, asObject, asString, asStringList } from "./video-analysis";
import type { Lang } from "./video-analysis";

export type Standing = "behind" | "similar" | "ahead";

export interface CompetitorNote {
  name: string;
  whyTheyWork: string;
  pattern: string;
  copy: string[];
  avoid: string[];
}

export interface IdeaFromRivals {
  title: string;
  why: string;
  hook: string;
}

export interface CompetitorReport {
  summary: string;
  standing: { verdict: Standing; points: string[] };
  competitors: CompetitorNote[];
  gaps: string[];
  ideas: IdeaFromRivals[];
  thisWeek: string[];
}

export const REPORT_SYSTEM_PROMPT = [
  "You are Yoinsta's competitor analyst for a YouTube creator.",
  "Use ONLY the numbers and titles given. Never invent views, revenue, retention or topics you can't see.",
  "Competitor data is public stats only, so say when something can't be known.",
  "Reply with ONE JSON object and nothing else — no markdown, no code fences, no commentary.",
].join(" ");

export function buildReportPrompt(input: { competitorContext: string; ownContext: string; lang: Lang }): string {
  return [
    LANG_RULE[input.lang],
    "",
    "COMPETITOR AND CHANNEL NUMBERS (public stats; YOU = the creator):",
    input.competitorContext.slice(0, 7000),
    "",
    "THE CREATOR'S OWN CHANNEL (private analytics):",
    input.ownContext.slice(0, 2500) || "(unavailable)",
    "",
    "TASK",
    "Work out what the competitors do that works, how the creator compares, and what to do next. Return exactly:",
    "{",
    '  "summary": "3 sentences: where the creator stands against these channels and the single biggest opportunity",',
    '  "standing": {"verdict": "behind|similar|ahead", "points": ["numbers-based reasons"]},',
    '  "competitors": [{"name": "channel name exactly as given", "whyTheyWork": "", "pattern": "their repeatable title / format pattern", "copy": ["what the creator can adapt"], "avoid": ["what not to copy"]}],',
    '  "gaps": ["topics, formats or habits competitors have that the creator does not"],',
    '  "ideas": [{"title": "", "why": "which competitor result inspired it", "hook": "the first 3 seconds"}],',
    '  "thisWeek": ["concrete actions for the next 7 days"]',
    "}",
    "",
    "RULES",
    "- Cite real numbers from the data (views, uploads per week, views per subscriber) in every reason.",
    "- competitors: one entry per COMPETITOR in the data. Do not invent channels.",
    "- ideas: exactly 5. Titles under 70 characters, honest, in the language of the creator's current titles. Each must be inspired by something visible in the data (an outlier, a title word, a format).",
    "- Never suggest copying a video or its thumbnail; suggest adapting the idea into the creator's own style.",
    "- thisWeek: 3 to 5 actions, each doable in a week.",
  ].join("\n");
}

function asStanding(v: unknown): Standing {
  return v === "behind" || v === "similar" || v === "ahead" ? v : "similar";
}

export function normalizeReport(raw: unknown): CompetitorReport {
  const root = asObject(raw);
  const standing = asObject(root.standing);

  const competitors: CompetitorNote[] = [];
  if (Array.isArray(root.competitors)) {
    for (const item of root.competitors) {
      const o = asObject(item);
      const name = asString(o.name, 120);
      if (!name) continue;
      competitors.push({
        name,
        whyTheyWork: asString(o.whyTheyWork, 500),
        pattern: asString(o.pattern, 400),
        copy: asStringList(o.copy, 4, 250),
        avoid: asStringList(o.avoid, 3, 250),
      });
      if (competitors.length >= 8) break;
    }
  }

  const ideas: IdeaFromRivals[] = [];
  if (Array.isArray(root.ideas)) {
    for (const item of root.ideas) {
      // models sometimes return a bare title string instead of {title, why, hook}
      const o = typeof item === "string" ? { title: item } : asObject(item);
      const title = asString(o.title, 140).replace(/[<>]/g, "");
      if (!title) continue;
      ideas.push({ title, why: asString(o.why, 350), hook: asString(o.hook, 300) });
      if (ideas.length >= 6) break;
    }
  }

  return {
    summary: asString(root.summary, 800),
    standing: { verdict: asStanding(standing.verdict), points: asStringList(standing.points, 6, 300) },
    competitors,
    gaps: asStringList(root.gaps, 6, 300),
    ideas,
    thisWeek: asStringList(root.thisWeek, 6, 300),
  };
}
