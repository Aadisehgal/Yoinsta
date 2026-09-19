export interface ScoreSection {
  score: number;
  max: number;
  tips: string[];
}

const POWER_WORDS = [
  "best", "ultimate", "secret", "proven", "easy", "free", "new", "top",
  "guide", "review", "how to", "why", "shocking", "amazing", "vs",
  "mistake", "hack", "tips", "beginner", "advanced",
];

export function scoreTitle(title: string): ScoreSection {
  const tips: string[] = [];
  let score = 0;
  const max = 35;
  const len = title.length;

  if (len >= 40 && len <= 70) {
    score += 15;
  } else if (len >= 20 && len < 40) {
    score += 9;
    tips.push(`Title is ${len} chars — 40–70 uses YouTube's search space better.`);
  } else if (len > 70) {
    score += 6;
    tips.push(`Title is ${len} chars and may get cut off in search — aim for 40–70.`);
  } else {
    tips.push(`Title is only ${len} chars — aim for 40–70 characters.`);
  }

  const lower = title.toLowerCase();
  if (/\d/.test(title)) {
    score += 6;
  } else {
    tips.push('Consider adding a number (e.g. "5 Tips", "2026") — numbered titles get more clicks.');
  }

  if (POWER_WORDS.some((w) => lower.includes(w))) {
    score += 8;
  } else {
    tips.push('Add a power word like "Best", "How to", or "Ultimate" to boost click-through.');
  }

  const letters = title.replace(/[^a-zA-Z]/g, "");
  const upperRatio = letters.length ? (title.match(/[A-Z]/g)?.length ?? 0) / letters.length : 0;
  if (upperRatio < 0.3) {
    score += 6;
  } else {
    tips.push("Too many capital letters can look spammy — reserve caps for 1-2 key words.");
  }

  return { score: Math.min(score, max), max, tips };
}

export function scoreDescription(description: string): ScoreSection {
  const tips: string[] = [];
  let score = 0;
  const max = 35;
  const len = description.length;

  if (len >= 200) {
    score += 12;
  } else if (len >= 100) {
    score += 7;
    tips.push("Description is a bit short — 200+ characters gives YouTube more to index.");
  } else {
    tips.push("Description is very short — add at least 2-3 sentences describing the video.");
  }

  if (/\d{1,2}:\d{2}(:\d{2})?/.test(description)) {
    score += 10;
  } else {
    tips.push("Add timestamps (e.g. 0:00 Intro) — they boost retention and show as chapters.");
  }

  if (/https?:\/\//.test(description)) {
    score += 6;
  } else {
    tips.push("Add a link (social, related video, or playlist) to keep viewers on your channel.");
  }

  const hashtagCount = (description.match(/#\w+/g) ?? []).length;
  if (hashtagCount >= 1 && hashtagCount <= 5) {
    score += 7;
  } else if (hashtagCount > 5) {
    score += 3;
    tips.push("You're using many hashtags — 3-5 relevant ones work better than a long list.");
  } else {
    tips.push("Add 3-5 relevant hashtags to help YouTube categorize the video.");
  }

  return { score: Math.min(score, max), max, tips };
}

export function scoreTags(tags: string[]): ScoreSection {
  const tips: string[] = [];
  let score = 0;
  const max = 30;
  const count = tags.length;
  const totalChars = tags.join(",").length;

  if (count >= 8 && count <= 15) {
    score += 15;
  } else if (count > 0) {
    score += 7;
    tips.push(
      count > 15
        ? "You have a lot of tags — 8-15 focused tags usually work better than many broad ones."
        : `Only ${count} tags — aim for 8-15 relevant tags.`
    );
  } else {
    tips.push("No tags found — add 8-15 relevant tags to help YouTube understand the topic.");
  }

  if (totalChars >= 300 && totalChars <= 480) {
    score += 9;
  } else if (totalChars > 0) {
    score += 4;
    tips.push(
      totalChars > 480
        ? "Tags are close to YouTube's 500-character limit — trim the least relevant ones."
        : "Tags use little of YouTube's 500-character budget — add a few more specific long-tail tags."
    );
  }

  const longTail = tags.filter((t) => t.trim().split(/\s+/).length >= 3).length;
  if (longTail >= 2) {
    score += 6;
  } else {
    tips.push("Mix in a couple of longer, specific tags (3+ words) alongside broad ones.");
  }

  return { score: Math.min(score, max), max, tips };
}

export interface SeoScoreResult {
  total: number;
  title: ScoreSection;
  description: ScoreSection;
  tags: ScoreSection;
  tips: string[];
}

/** Deterministic heuristic scorer — no AI involved, same input always gives the same score. */
export function computeSeoScore(video: { title: string; description: string; tags: string[] }): SeoScoreResult {
  const title = scoreTitle(video.title);
  const description = scoreDescription(video.description);
  const tags = scoreTags(video.tags);

  return {
    total: title.score + description.score + tags.score,
    title,
    description,
    tags,
    tips: [...title.tips, ...description.tips, ...tags.tips],
  };
}
