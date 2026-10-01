// Pure helpers for the AI video review: build the prompt from real data, pull JSON out of the
// model's reply, and clean it up so the UI can trust it. No network or framework imports.

export type Verdict = "good" | "ok" | "weak";

export interface TagNote {
  tag: string;
  reason: string;
}

export interface VideoAnalysis {
  overallScore: number;
  summary: string;
  title: { score: number; verdict: Verdict; reasons: string[]; suggestions: string[] };
  description: { score: number; verdict: Verdict; issues: string[]; improved: string };
  tags: { keep: TagNote[]; remove: TagNote[]; add: TagNote[] };
  quickWins: string[];
}

export type Lang = "hinglish" | "english";

// ---------------------------------------------------------------- reading the model's reply

/** Finds the first JSON object in a model reply, tolerating code fences and trailing commas. */
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const slice = unfenced.slice(start, end + 1);

  for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next repair
    }
  }
  return null;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asString = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

const asStringList = (v: unknown, maxItems: number, maxLen = 300): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => asString(x, maxLen))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const asScore = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
};

function asVerdict(v: unknown, score: number): Verdict {
  if (v === "good" || v === "ok" || v === "weak") return v;
  return score >= 75 ? "good" : score >= 50 ? "ok" : "weak";
}

function asTagNotes(v: unknown, maxItems: number): TagNote[] {
  if (!Array.isArray(v)) return [];
  const out: TagNote[] = [];
  for (const item of v) {
    // Models sometimes return a bare string instead of {tag, reason}.
    const o = typeof item === "string" ? { tag: item, reason: "" } : asObject(item);
    const tag = asString(o.tag, 100).replace(/^#+/, "").trim();
    if (!tag) continue;
    out.push({ tag, reason: asString(o.reason, 200) });
    if (out.length >= maxItems) break;
  }
  return out;
}

// ---------------------------------------------------------------- deterministic tag hygiene

export function tagHygiene(tags: string[]): TagNote[] {
  const flags: TagNote[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const key = tag.trim().toLowerCase();
    if (seen.has(key)) {
      flags.push({ tag, reason: "Duplicate of another tag." });
      continue;
    }
    seen.add(key);
    if (Array.from(key).length < 3) flags.push({ tag, reason: "Too short to help search." });
    else if (key.startsWith("#")) flags.push({ tag, reason: "Tags don't need a # sign." });
    else if (Array.from(key).length > 60) flags.push({ tag, reason: "Very long — real searches are shorter." });
  }
  return flags;
}

/**
 * Turns the model's raw JSON into the shape the UI expects, and keeps it honest against the
 * video's real tags: it can only "remove" a tag the video actually has, every existing tag is
 * either kept or removed exactly once, and "add" never repeats a tag already there.
 */
export function normalizeAnalysis(raw: unknown, currentTags: string[]): VideoAnalysis {
  const root = asObject(raw);
  const title = asObject(root.title);
  const description = asObject(root.description);
  const tags = asObject(root.tags);

  const titleScore = asScore(title.score);
  const descScore = asScore(description.score);

  // --- tags: reconcile with what the video really has
  const byKey = new Map(currentTags.map((t) => [t.trim().toLowerCase(), t] as const));
  const remove: TagNote[] = [];
  const keep: TagNote[] = [];
  const decided = new Set<string>();

  for (const note of asTagNotes(tags.remove, 60)) {
    const key = note.tag.toLowerCase();
    const real = byKey.get(key);
    if (!real || decided.has(key)) continue;
    decided.add(key);
    remove.push({ tag: real, reason: note.reason });
  }
  for (const flag of tagHygiene(currentTags)) {
    const key = flag.tag.trim().toLowerCase();
    // Duplicates are flagged on the 2nd occurrence; keep only the first one in "keep".
    if (flag.reason === "Duplicate of another tag.") continue;
    if (decided.has(key)) continue;
    decided.add(key);
    remove.push({ tag: flag.tag, reason: flag.reason });
  }
  for (const note of asTagNotes(tags.keep, 60)) {
    const key = note.tag.toLowerCase();
    const real = byKey.get(key);
    if (!real || decided.has(key)) continue;
    decided.add(key);
    keep.push({ tag: real, reason: note.reason });
  }
  for (const tag of currentTags) {
    const key = tag.trim().toLowerCase();
    if (decided.has(key)) continue;
    decided.add(key);
    keep.push({ tag, reason: "" });
  }

  const add: TagNote[] = [];
  const addSeen = new Set<string>();
  for (const note of asTagNotes(tags.add, 20)) {
    const key = note.tag.toLowerCase();
    if (byKey.has(key) || addSeen.has(key)) continue;
    addSeen.add(key);
    add.push(note);
    if (add.length >= 12) break;
  }

  const overall =
    root.overallScore !== undefined ? asScore(root.overallScore) : Math.round((titleScore + descScore) / 2);

  return {
    overallScore: overall,
    summary: asString(root.summary, 700),
    title: {
      score: titleScore,
      verdict: asVerdict(title.verdict, titleScore),
      reasons: asStringList(title.reasons, 6),
      suggestions: asStringList(title.suggestions, 5, 120),
    },
    description: {
      score: descScore,
      verdict: asVerdict(description.verdict, descScore),
      issues: asStringList(description.issues, 6),
      improved: asString(description.improved, 4000).replace(/[<>]/g, ""),
    },
    tags: { keep, remove, add },
    quickWins: asStringList(root.quickWins, 6),
  };
}

// ---------------------------------------------------------------- building the prompt

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Roughly the phrase a viewer would type to find this video: title minus hashtags and symbols. */
export function searchPhraseFromTitle(title: string, maxWords = 6): string {
  return title
    .replace(/#\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

export interface AnalysisInput {
  title: string;
  description: string;
  tags: string[];
  durationSeconds: number;
  publishedAt: string;
  privacyStatus: string;
  views: number;
  likes: number;
  comments: number;
  seo: { total: number; title: number; description: number; tags: number; tips: string[] };
  suggestions: { phrase: string; items: string[] }[];
  channelContext: string;
  lang: Lang;
  tagCharsUsed: number;
}

export const ANALYSIS_SYSTEM_PROMPT = [
  "You are Yoinsta's YouTube video coach. You review ONE video's title, description and tags and",
  "tell the creator plainly what is working and what to change.",
  "Use ONLY the data given. Never invent search volumes, rankings, competitor data or view counts;",
  "if something can't be judged from the data, say so.",
  "Reply with ONE JSON object and nothing else — no markdown, no code fences, no commentary.",
].join(" ");

const LANG_RULE: Record<Lang, string> = {
  hinglish:
    "Write every explanation (summary, reasons, issues, quickWins, tag reasons) in simple Hinglish — Hindi in English letters, short sentences. Keep title suggestions, the improved description and tags in the same language as the video's current title.",
  english:
    "Write every explanation in simple, short English. Keep title suggestions, the improved description and tags in the same language as the video's current title.",
};

export function buildAnalysisPrompt(input: AnalysisInput): string {
  const tagList = input.tags.length
    ? input.tags.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(this video has no tags)";

  const suggestionBlock = input.suggestions.length
    ? input.suggestions
        .map((s) => `Searches people type after "${s.phrase}":\n${s.items.map((x) => `- ${x}`).join("\n")}`)
        .join("\n\n")
    : "(no autocomplete data available)";

  return [
    LANG_RULE[input.lang],
    "",
    "VIDEO",
    `- Title: ${input.title}`,
    `- Length: ${formatDuration(input.durationSeconds)}${input.durationSeconds > 0 && input.durationSeconds <= 180 ? " (likely a Short)" : ""}`,
    `- Visibility: ${input.privacyStatus}`,
    `- Published: ${input.publishedAt ? input.publishedAt.slice(0, 10) : "not yet"}`,
    `- Views: ${input.views}, likes: ${input.likes}, comments: ${input.comments}`,
    "",
    "DESCRIPTION (exactly as written):",
    '"""',
    input.description.slice(0, 2500) || "(empty)",
    '"""',
    "",
    `TAGS (${input.tags.length} tags, ${input.tagCharsUsed}/500 characters used):`,
    tagList,
    "",
    "AUTOMATIC CHECKS (deterministic, already computed):",
    `- SEO score ${input.seo.total}/100 (title ${input.seo.title}, description ${input.seo.description}, tags ${input.seo.tags})`,
    ...input.seo.tips.slice(0, 8).map((t) => `- Tip: ${t}`),
    "",
    "REAL YOUTUBE SEARCH SUGGESTIONS (autocomplete):",
    suggestionBlock,
    "",
    "CHANNEL CONTEXT:",
    input.channelContext.slice(0, 2500) || "(unavailable)",
    "",
    "TASK",
    "Return exactly this JSON shape:",
    "{",
    '  "overallScore": 0,',
    '  "summary": "2-3 sentences: the biggest strength and the biggest problem",',
    '  "title": {"score": 0, "verdict": "good|ok|weak", "reasons": ["..."], "suggestions": ["...", "...", "..."]},',
    '  "description": {"score": 0, "verdict": "good|ok|weak", "issues": ["..."], "improved": "full rewritten description"},',
    '  "tags": {"keep": [{"tag": "...", "reason": "..."}], "remove": [{"tag": "...", "reason": "..."}], "add": [{"tag": "...", "reason": "..."}]},',
    '  "quickWins": ["..."]',
    "}",
    "",
    "RULES",
    "- All scores are integers 0-100.",
    "- title.suggestions: 3 alternative titles, each under 70 characters, honest (no false promises).",
    "- description.improved: keep the creator's real facts; first two lines must hook and contain the main keywords; under 1500 characters; never use the < or > characters.",
    '- tags: classify EVERY existing tag exactly once as keep or remove, copying the tag text exactly as listed above. Keep a tag only if a viewer could plausibly search it AND it matches this video. Reasons under 12 words.',
    "- tags.add: up to 10 new tags, preferring phrases from the real search suggestions above. Never repeat an existing tag. Total tags must stay within 500 characters.",
    "- Judge the title and description against this video's actual topic, not generic advice.",
  ].join("\n");
}
