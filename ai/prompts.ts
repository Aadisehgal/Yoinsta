/**
 * Every AI feature's prompt lives here — nowhere else should a raw prompt
 * string be constructed. Keeps prompt tuning in one place per provider-agnostic call.
 */
export const PROMPTS = {
  titles: (topic: string) =>
    `Generate 5 punchy, SEO-friendly YouTube video titles for a video about: "${topic}". ` +
    `Return ONLY a numbered list, one title per line, no extra commentary.`,

  description: (topic: string, keyPoints: string) =>
    `Write a YouTube video description for a video about: "${topic}". ` +
    `Key points to cover: ${keyPoints || "(use your best judgement)"}. ` +
    `Start with a one-line hook, then 2-3 short paragraphs, then 5-8 relevant hashtags. ` +
    `Return ONLY the description text.`,

  tags: (topic: string) =>
    `Generate 15 relevant YouTube tags for a video about: "${topic}". ` +
    `Return ONLY a comma-separated list, no numbering.`,

  hooks: (topic: string) =>
    `Write 5 attention-grabbing spoken opening lines (first 5 seconds) for a YouTube video ` +
    `about: "${topic}". Return ONLY a numbered list.`,
} as const;

export type AIFeature = keyof typeof PROMPTS;

/** Grounded in the creator's real channel data — used by Daily Ideas → Personalized. */
export function personalizedIdeasPrompt(channelContext: string): string {
  return (
    `You are a YouTube content strategist. Here is this creator's real channel data:\n\n${channelContext}\n\n` +
    `Based on this data — their niche, what's performed well, gaps in their recent uploads — suggest 5 ` +
    `specific video ideas for their next upload. Return ONLY a numbered list, one idea per line, each ` +
    `combining a concrete title with a short reason it should work for THIS channel specifically (not ` +
    `generic advice).`
  );
}

/** Grounded in free autocomplete suggestions (no quota cost) — used by Daily Ideas → Trending. */
export function trendingIdeasPrompt(topic: string, relatedSearches: string[]): string {
  const related = relatedSearches.length ? relatedSearches.join(", ") : "(no related searches found)";
  return (
    `A YouTube creator wants video ideas about: "${topic}". People are also currently searching for ` +
    `these related terms: ${related}.\n\nSuggest 5 specific, timely video ideas that capitalize on this ` +
    `search demand. Return ONLY a numbered list, one idea per line, each with a concrete title and a ` +
    `short reason it should perform well right now.`
  );
}
