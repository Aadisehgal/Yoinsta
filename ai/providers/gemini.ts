import type { ChatMessage } from "../types";

// "-latest" alias follows Google's current stable Flash model, so this doesn't break
// every time a specific version is retired. Override with GEMINI_TEXT_MODEL if needed.
const MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-flash-latest";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

// Plain fetch + x-goog-api-key header (works for both AIza... and the newer AQ.... keys).
async function generate(apiKey: string, contents: GeminiContent[], systemPrompt?: string): Promise<string> {
  const res = await fetch(`${BASE}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents,
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    }),
  });

  if (!res.ok) {
    const err = new Error(`Gemini request failed: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
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
