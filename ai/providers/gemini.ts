import type { ChatMessage } from "../types";

// Models are tried in order. If one is overloaded (503/500/502/504) we retry it once after a
// short pause, then move on; if it's rate-limited (429) or unknown (404) we move on right away.
// The "-latest" aliases follow Google's current stable model. Override the whole list on Vercel
// with GEMINI_TEXT_MODEL="modelA,modelB" (comma-separated, tried left to right).
const MODELS = (process.env.GEMINI_TEXT_MODEL ?? "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OVERLOADED = new Set([500, 502, 503, 504]);
const RETRY_PAUSE_MS = 800;

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };
type GeminiError = Error & { status?: number; detail?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Plain fetch + x-goog-api-key header (works for both AIza... and the newer AQ.... keys).
async function requestOnce(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
  systemPrompt?: string
): Promise<string> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents,
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    }),
  });

  if (!res.ok) {
    const err = new Error(`Gemini request failed: ${res.status}`) as GeminiError;
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}

async function generate(apiKey: string, contents: GeminiContent[], systemPrompt?: string): Promise<string> {
  const trail: string[] = []; // e.g. "gemini-flash-latest 503" — model names + status codes only, never the key
  let lastErr: GeminiError | undefined;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await requestOnce(apiKey, model, contents, systemPrompt);
      } catch (err) {
        lastErr = err as GeminiError;
        const status = lastErr.status;

        if (status === 404 || status === 429) {
          trail.push(`${model} ${status}`);
          break; // other models have their own availability/quota
        }
        if (status !== undefined && OVERLOADED.has(status)) {
          if (attempt === 0) {
            await sleep(RETRY_PAUSE_MS); // brief pause, one retry on the same model
          } else {
            trail.push(`${model} ${status}`);
          }
          continue;
        }
        // 400 / 401 / 403 / empty answer: another model won't fix these — stop and report.
        trail.push(`${model} ${status ?? "error"}`);
        lastErr.detail = trail.join(" → ");
        throw lastErr;
      }
    }
  }

  const finalErr = (lastErr ?? new Error("Gemini request failed")) as GeminiError;
  finalErr.detail = trail.join(" → ");
  throw finalErr;
}

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  return generate(apiKey, [{ role: "user", parts: [{ text: prompt }] }]);
}

export async function chatGemini(apiKey: string, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  return generate(apiKey, contents, systemPrompt);
}
