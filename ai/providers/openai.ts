import OpenAI from "openai";
import type { ChatMessage } from "../types";

export async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini", // update as OpenAI's lineup changes
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function chatOpenAI(apiKey: string, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });

  return completion.choices[0]?.message?.content ?? "";
}
