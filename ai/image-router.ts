import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { generateImageOpenAI } from "./providers/image-openai";
import { generateImageGemini } from "./providers/image-gemini";

export interface ImageResponse {
  success: boolean;
  base64?: string;
  mimeType?: string;
  provider?: string;
  error?: string;
}

const IMAGE_PROVIDERS = ["openai", "gemini"];
const IMAGE_LABEL: Record<string, string> = { openai: "OpenAI", gemini: "Gemini" };
const IMAGE_DISPATCH: Record<string, (apiKey: string, prompt: string) => Promise<{ base64: string; mimeType: string }>> = {
  openai: generateImageOpenAI,
  gemini: generateImageGemini,
};
const IMAGE_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function friendlyError(label: string, err: unknown): string {
  if (err instanceof Error && err.message === "TIMEOUT") return `${label} took too long to generate the image — try again.`;
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) return `Your ${label} API key was rejected — check it in Settings.`;
  if (status === 429) return `${label} rate-limited or out of image credits — check your usage/billing there.`;
  return `${label} couldn't generate that image right now.`;
}

export async function generateImage(userId: string, prompt: string, provider?: string): Promise<ImageResponse> {
  if (provider && !IMAGE_DISPATCH[provider]) {
    return { success: false, error: `${provider} doesn't support image generation.` };
  }

  const key = await prisma.apiKey.findFirst({
    where: { userId, isActive: true, lastTestOk: true, provider: provider ?? { in: IMAGE_PROVIDERS } },
    orderBy: { lastTestedAt: "desc" },
  });

  if (!key) {
    return { success: false, error: "Thumbnail generation needs an OpenAI or Gemini key (the only two that support image generation) — add one in Settings." };
  }

  const label = IMAGE_LABEL[key.provider];
  const plainKey = decrypt(key.keyEncrypted);

  try {
    const { base64, mimeType } = await withTimeout(IMAGE_DISPATCH[key.provider](plainKey, prompt), IMAGE_TIMEOUT_MS);
    return { success: true, base64, mimeType, provider: key.provider };
  } catch (err) {
    return { success: false, provider: key.provider, error: friendlyError(label, err) };
  }
}
