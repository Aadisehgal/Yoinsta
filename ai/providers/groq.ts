import OpenAI from "openai";
import type { ChatMessage } from "../types";

/**
 * Groq speaks the OpenAI API shape, so we reuse the official `openai` SDK
 * and just point it at Groq's base URL — no separate SDK needed.
 */
export async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile", // update as Groq's lineup changes
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function chatGroq(apiKey: string, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });

  return completion.choices[0]?.message?.content ?? "";
}
