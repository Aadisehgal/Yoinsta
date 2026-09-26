import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatMessage } from "../types";

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" }); // update as Google's lineup changes

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function chatGemini(apiKey: string, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const last = messages[messages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(last.content);
  return result.response.text();
}
