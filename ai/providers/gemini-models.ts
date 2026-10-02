// Finds which Gemini models a key can use RIGHT NOW. Google retires and renames models often — a
// "-latest" alias can be overloaded while an older model 404s — so when the usual models fail we ask
// Google's own model list instead of guessing. Only model names ever leave this file, never the key.

const LIST_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";

export interface ListedModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

// Specialised models that can't do plain text / video understanding.
const NOT_GENERAL = /(image|tts|live|audio|native|embedding|thinking|robotics|computer-use|exp|customtools|deep-research|vision|aqa)/;

function rank(id: string) {
  const v = /gemini-(\d+)(?:\.(\d+))?/.exec(id);
  return {
    preview: /preview/.test(id) ? 1 : 0,
    lite: /lite/.test(id) ? 1 : 0,
    alias: /latest/.test(id) ? 1 : 0,
    major: v ? Number(v[1]) : 0,
    minor: v && v[2] ? Number(v[2]) : 0,
  };
}

/** General-purpose Gemini "flash" models that support generateContent: stable before preview, full before lite, newer first. */
export function rankGeminiModels(models: ListedModel[], skip: Set<string> = new Set()): string[] {
  const ids = models
    .filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => (m.name as string).replace(/^models\//, ""))
    .filter((id) => /^gemini-/.test(id) && /flash/.test(id) && !NOT_GENERAL.test(id) && !skip.has(id));

  return Array.from(new Set(ids)).sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return (
      x.preview - y.preview ||
      x.lite - y.lite ||
      y.major - x.major ||
      y.minor - x.minor ||
      x.alias - y.alias ||
      a.localeCompare(b)
    );
  });
}

/** Asks Google which models this key can call. Any failure just means "no extra candidates". */
export async function discoverGeminiModels(apiKey: string, skip: Set<string>, limit = 3): Promise<string[]> {
  try {
    const res = await fetch(LIST_URL, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: ListedModel[] };
    return rankGeminiModels(data.models ?? [], skip).slice(0, limit);
  } catch {
    return [];
  }
}
