// Pure helpers for the "scene-by-scene review": the prompt Gemini gets alongside the video, and a
// cleaner that turns its JSON reply into something the UI can trust. No network or framework imports.

import { LANG_RULE, asObject, asScore, asString, asStringList, asVerdict, formatDuration } from "./video-analysis";
import type { Lang, Verdict } from "./video-analysis";

export interface SceneNote {
  start: string;
  end: string;
  what: string;
  works: string;
  problem: string;
  score: number;
}

export interface ScenePrompt {
  scene: number;
  time: string;
  prompt: string;
}

export interface SceneReview {
  summary: string;
  hook: { score: number; verdict: Verdict; whatHappens: string; fix: string };
  scenes: SceneNote[];
  pacing: string;
  soundAndText: string;
  retentionRisks: string[];
  nextVideo: { animal: string; why: string; title: string; concept: string; prompts: ScenePrompt[] };
}

/** Longest stretch of a video we send to Gemini (keeps the review inside Vercel's 60 s limit). */
export const MAX_REVIEW_SECONDS = 600;

export const SCENE_SYSTEM_PROMPT = [
  "You are Yoinsta's video coach. You are given a YouTube video to WATCH and listen to.",
  "Describe only what you actually see and hear — never invent scenes, text or sounds.",
  "Reply with ONE JSON object and nothing else — no markdown, no code fences, no commentary.",
].join(" ");

export interface ScenePromptInput {
  title: string;
  durationSeconds: number;
  clippedToSeconds?: number;
  channelContext: string;
  lang: Lang;
}

export function buildScenePrompt(input: ScenePromptInput): string {
  const isShort = input.durationSeconds > 0 && input.durationSeconds <= 180;
  const length = input.durationSeconds > 0 ? formatDuration(input.durationSeconds) : "unknown length";
  const clip = input.clippedToSeconds
    ? `Only the first ${formatDuration(input.clippedToSeconds)} of the video is provided — review that part.`
    : "";

  return [
    LANG_RULE[input.lang],
    "",
    `VIDEO: "${input.title}" (${length}${isShort ? ", a Short — vertical, fast viewers" : ""}). ${clip}`.trim(),
    "",
    "CHANNEL CONTEXT (real numbers from this creator's channel):",
    input.channelContext.slice(0, 2500) || "(unavailable)",
    "",
    "TASK",
    "Watch the video, then return exactly this JSON shape:",
    "{",
    '  "summary": "2-3 sentences: what the video is and the single biggest thing to fix",',
    '  "hook": {"score": 0, "verdict": "good|ok|weak", "whatHappens": "what the first 3 seconds show and say", "fix": "one concrete change"},',
    '  "scenes": [{"start": "0:00", "end": "0:03", "what": "what is on screen / said", "works": "what works here", "problem": "what hurts attention (empty string if nothing)", "score": 0}],',
    '  "pacing": "is the speed of cuts and story right? what to change",',
    '  "soundAndText": "music, voice, sound effects and on-screen text: what to improve",',
    '  "retentionRisks": ["moments where viewers are likely to leave, with timestamps"],',
    '  "nextVideo": {"animal": "", "why": "", "title": "", "concept": "", "prompts": [{"scene": 1, "time": "0:00-0:03", "prompt": ""}]}',
    "}",
    "",
    "RULES",
    "- scenes: base them ONLY on what you see and hear; use real M:SS timestamps; cover the whole video in 4-10 scenes (merge similar moments). score = how well that scene holds attention, integer 0-100.",
    "- nextVideo.animal: recommend ONE animal or creature (with a twist) for the creator's NEXT video, chosen from what worked in THIS video and the channel numbers above. why: 2 short sentences. title: SEO-friendly, under 70 characters, honest.",
    `- nextVideo.prompts: 4-6 prompts, one per scene of the NEXT video. Each must be self-contained and detailed enough to paste into an AI image/video generator: subject, setting, lighting, camera move, style${isShort ? ", vertical 9:16" : ", 16:9"}. Keep the same visual style as this video so the channel stays consistent. Write the prompts in English; no brand names, no real people.`,
  ].join("\n");
}

function asTime(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return formatDuration(Math.max(0, Math.round(v)));
  return asString(v, 12);
}

export function normalizeSceneReview(raw: unknown): SceneReview {
  const root = asObject(raw);
  const hook = asObject(root.hook);
  const next = asObject(root.nextVideo);
  const hookScore = asScore(hook.score);

  const scenes: SceneNote[] = [];
  if (Array.isArray(root.scenes)) {
    for (const item of root.scenes) {
      const o = asObject(item);
      const what = asString(o.what, 400);
      if (!what) continue;
      const score = asScore(o.score);
      scenes.push({
        start: asTime(o.start),
        end: asTime(o.end),
        what,
        works: asString(o.works, 300),
        problem: asString(o.problem, 300),
        score,
      });
      if (scenes.length >= 14) break;
    }
  }

  const prompts: ScenePrompt[] = [];
  if (Array.isArray(next.prompts)) {
    for (const item of next.prompts) {
      // models sometimes return a bare string instead of {scene, time, prompt}
      const o = typeof item === "string" ? { prompt: item } : asObject(item);
      const prompt = asString(o.prompt, 1200);
      if (!prompt) continue;
      const n = Number(o.scene);
      prompts.push({
        scene: Number.isFinite(n) && n > 0 ? Math.round(n) : prompts.length + 1,
        time: asString(o.time, 20),
        prompt,
      });
      if (prompts.length >= 8) break;
    }
  }

  return {
    summary: asString(root.summary, 700),
    hook: {
      score: hookScore,
      verdict: asVerdict(hook.verdict, hookScore),
      whatHappens: asString(hook.whatHappens, 400),
      fix: asString(hook.fix, 400),
    },
    scenes,
    pacing: asString(root.pacing, 600),
    soundAndText: asString(root.soundAndText, 600),
    retentionRisks: asStringList(root.retentionRisks, 6),
    nextVideo: {
      animal: asString(next.animal, 120),
      why: asString(next.why, 500),
      title: asString(next.title, 140),
      concept: asString(next.concept, 600),
      prompts,
    },
  };
}
