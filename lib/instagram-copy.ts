// Prompts and reply-cleaning for the Instagram tools: the caption + hashtag maker, and the AI report on a
// connected account. Pure (no network). Reuses the tolerant helpers of the YouTube tools so a slightly messy
// model reply still turns into something usable.

import { LANG_RULE, asObject, asString, asStringList } from "./video-analysis";
import type { Lang } from "./video-analysis";
import { IG_MAX_HASHTAGS } from "./instagram-metrics";

export const CAPTION_MAX_CHARS = 2200; // Instagram's caption limit

/** #tag-safe text: letters (any script), numbers, underscore; no leading #, no spaces. */
export function cleanHashtag(raw: string): string {
  return raw.replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "").slice(0, 60);
}

export function cleanHashtags(list: unknown, max = IG_MAX_HASHTAGS): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const tag = cleanHashtag(typeof item === "string" ? item : "");
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------- caption + hashtag maker

export type Tone = "fun" | "dramatic" | "educational" | "story";
export type CaptionLang = "english" | "hinglish";

export interface CaptionPack {
  hooks: string[];
  caption: string;
  hashtags: string[];
  coverText: string[];
  cta: string;
  altText: string;
  /** Ready to paste: caption + blank line + #hashtags. */
  fullText: string;
}

export const CAPTION_SYSTEM_PROMPT = [
  "You are Yoinsta's Instagram copywriter for short-video creators.",
  "Write only from the facts given; never invent product claims, numbers or news.",
  "Reply with ONE JSON object and nothing else — no markdown, no code fences, no commentary.",
].join(" ");

const TONE_RULE: Record<Tone, string> = {
  fun: "Tone: playful and punchy, a little cheeky.",
  dramatic: "Tone: dramatic and suspenseful — build curiosity.",
  educational: "Tone: clear and curious — teach one surprising fact.",
  story: "Tone: a mini story with a twist at the end.",
};

const CAPTION_LANG_RULE: Record<CaptionLang, string> = {
  english: "Write the hooks, caption, cover text and CTA in simple English.",
  hinglish: "Write the hooks, caption, cover text and CTA in natural Hinglish (Hindi in English letters). Hashtags stay in English.",
};

export function buildCaptionPrompt(input: {
  topic: string;
  videoTitle?: string;
  videoDescription?: string;
  videoTags?: string[];
  tone: Tone;
  lang: CaptionLang;
  niche?: string;
}): string {
  const facts = [
    input.videoTitle ? `YouTube title: ${input.videoTitle}` : "",
    input.videoDescription ? `YouTube description: ${input.videoDescription.slice(0, 700)}` : "",
    input.videoTags && input.videoTags.length ? `YouTube tags: ${input.videoTags.slice(0, 15).join(", ")}` : "",
    input.topic ? `What the Reel is about: ${input.topic}` : "",
    input.niche ? `Creator's niche / channel: ${input.niche}` : "",
  ].filter(Boolean);

  return [
    CAPTION_LANG_RULE[input.lang],
    TONE_RULE[input.tone],
    "",
    "THE REEL / POST",
    ...facts,
    "",
    "TASK",
    "Write Instagram copy for this post. Return exactly this JSON shape:",
    "{",
    '  "hooks": ["", "", ""],',
    '  "caption": "",',
    '  "hashtags": ["", "", ""],',
    '  "coverText": ["", "", ""],',
    '  "cta": "",',
    '  "altText": ""',
    "}",
    "",
    "RULES",
    "- hooks: 3 different first lines, each under 12 words. The first line is all people see before 'more' — make them stop scrolling.",
    "- caption: under 600 characters, starts with the best hook, short lines, ends with the CTA. Do NOT put hashtags in the caption.",
    `- hashtags: ${IG_MAX_HASHTAGS} at most (Instagram's limit). Pick 3 to 5 that match THIS post exactly — one specific niche tag, one topic tag, one broader tag. No #fyp / #viral / #follow4follow filler. Return them without the # sign.`,
    "- coverText: 3 options of 2 to 5 words for the Reel cover / first frame.",
    "- cta: one short line that asks for a comment, share or save in a way that fits the post.",
    "- altText: one factual sentence describing what is on screen (for accessibility).",
  ].join("\n");
}

export function normalizeCaptionPack(raw: unknown): CaptionPack {
  const root = asObject(raw);
  const hashtags = cleanHashtags(root.hashtags);
  // models sometimes put #tags inside the caption despite the rule — move them to the hashtag list
  let caption = asString(root.caption, CAPTION_MAX_CHARS);
  const inline = caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? [];
  if (inline.length > 0) {
    const merged = cleanHashtags([...hashtags, ...inline]);
    hashtags.length = 0;
    hashtags.push(...merged);
    caption = caption.replace(/#[\p{L}\p{M}\p{N}_]+/gu, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const tagLine = hashtags.map((t) => `#${t}`).join(" ");
  const fullText = [caption, tagLine].filter(Boolean).join("\n\n").slice(0, CAPTION_MAX_CHARS);

  return {
    hooks: asStringList(root.hooks, 3, 140),
    caption,
    hashtags,
    coverText: asStringList(root.coverText, 3, 60),
    cta: asString(root.cta, 200),
    altText: asString(root.altText, 300),
    fullText,
  };
}

// ---------------------------------------------------------------- AI report on a connected account

export type IgVerdict = "weak" | "okay" | "strong";

export interface IgIdea {
  title: string;
  hook: string;
  caption: string;
  hashtags: string[];
}

export interface IgHook {
  line: string;
  why: string;
}

export interface InstagramReport {
  summary: string;
  standing: { verdict: IgVerdict; points: string[] };
  whatWorks: string[];
  whatToFix: string[];
  formatAdvice: string;
  bestTime: string;
  hooks: IgHook[];
  ideas: IgIdea[];
  thisWeek: string[];
}

export const IG_REPORT_SYSTEM_PROMPT = [
  "You are Yoinsta's Instagram growth analyst for a short-video creator.",
  "Use ONLY the numbers and captions given. Never invent reach, followers, trends or posting times you can't see.",
  "If the sample is too small to conclude something, say so plainly.",
  "Reply with ONE JSON object and nothing else — no markdown, no code fences, no commentary.",
].join(" ");

export function buildIgReportPrompt(input: { context: string; youtubeContext: string; lang: Lang }): string {
  return [
    LANG_RULE[input.lang],
    "",
    "INSTAGRAM ACCOUNT (private insights from the Instagram API):",
    input.context.slice(0, 6000),
    "",
    "THE SAME CREATOR'S YOUTUBE CHANNEL (for niche context only):",
    input.youtubeContext.slice(0, 1800) || "(unavailable)",
    "",
    "TASK",
    "Work out what is working on this Instagram account, what to fix, and what to post next. Return exactly:",
    "{",
    '  "summary": "3 sentences: how the account is doing and the single biggest opportunity",',
    '  "standing": {"verdict": "weak|okay|strong", "points": ["numbers-based reasons"]},',
    '  "whatWorks": ["..."],',
    '  "whatToFix": ["..."],',
    '  "formatAdvice": "which format to focus on and why, using the by-format numbers",',
    '  "bestTime": "when to post, based ONLY on the data above (or say there is not enough data yet)",',
    '  "hooks": [{"line": "an opening line to try", "why": ""}],',
    '  "ideas": [{"title": "", "hook": "", "caption": "", "hashtags": ["", ""]}],',
    '  "thisWeek": ["concrete actions for the next 7 days"]',
    "}",
    "",
    "RULES",
    "- Cite real numbers (views, reach, saves, skip rate, posts per week) in every reason.",
    `- Instagram allows at most ${IG_MAX_HASHTAGS} hashtags. If the account uses more, say so in whatToFix. Every idea has 3 to ${IG_MAX_HASHTAGS} hashtags (no # sign, no #fyp-style filler).`,
    "- hooks: 3. ideas: exactly 5, each different, each inspired by something visible in the data or the YouTube niche. Caption under 300 characters, no hashtags inside it.",
    "- thisWeek: 3 to 5 actions, each doable in a week.",
  ].join("\n");
}

function asVerdict(v: unknown): IgVerdict {
  return v === "weak" || v === "okay" || v === "strong" ? v : "okay";
}

export function normalizeIgReport(raw: unknown): InstagramReport {
  const root = asObject(raw);
  const standing = asObject(root.standing);

  const hooks: IgHook[] = [];
  if (Array.isArray(root.hooks)) {
    for (const item of root.hooks) {
      const o = typeof item === "string" ? { line: item } : asObject(item);
      const line = asString(o.line, 160);
      if (line) hooks.push({ line, why: asString(o.why, 250) });
      if (hooks.length >= 4) break;
    }
  }

  const ideas: IgIdea[] = [];
  if (Array.isArray(root.ideas)) {
    for (const item of root.ideas) {
      const o = typeof item === "string" ? { title: item } : asObject(item);
      const title = asString(o.title, 140).replace(/[<>]/g, "");
      if (!title) continue;
      ideas.push({
        title,
        hook: asString(o.hook, 200),
        caption: asString(o.caption, 600).replace(/#[\p{L}\p{M}\p{N}_]+/gu, "").trim(),
        hashtags: cleanHashtags(o.hashtags),
      });
      if (ideas.length >= 6) break;
    }
  }

  return {
    summary: asString(root.summary, 800),
    standing: { verdict: asVerdict(standing.verdict), points: asStringList(standing.points, 6, 300) },
    whatWorks: asStringList(root.whatWorks, 6, 300),
    whatToFix: asStringList(root.whatToFix, 6, 300),
    formatAdvice: asString(root.formatAdvice, 500),
    bestTime: asString(root.bestTime, 400),
    hooks,
    ideas,
    thisWeek: asStringList(root.thisWeek, 6, 300),
  };
}
