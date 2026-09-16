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
