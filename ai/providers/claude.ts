import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "../types";

export async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-3-5-haiku-20241022", // update as Anthropic's lineup changes
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function chatClaude(apiKey: string, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
