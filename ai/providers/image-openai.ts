import OpenAI from "openai";

export interface GeneratedImage { base64: string; mimeType: string; }

export async function generateImageOpenAI(apiKey: string, prompt: string): Promise<GeneratedImage> {
  const client = new OpenAI({ apiKey });
  const result = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1536x1024",
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image returned.");
  return { base64, mimeType: "image/png" };
}
