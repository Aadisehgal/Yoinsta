import { GoogleGenerativeAI } from "@google/generative-ai";

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" }); // update as Google's lineup changes

  const result = await model.generateContent(prompt);
  return result.response.text();
}
