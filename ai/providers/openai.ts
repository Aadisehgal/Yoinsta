import OpenAI from "openai";

export async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini", // update as OpenAI's lineup changes
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0]?.message?.content ?? "";
}
