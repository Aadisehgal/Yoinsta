import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { callGroq } from "./providers/groq";
import { callGemini } from "./providers/gemini";
import { callOpenAI } from "./providers/openai";
import { callClaude } from "./providers/claude";
import type { AIResponse } from "./types";

const CALL_TIMEOUT_MS = 20_000;

export const PROVIDER_LABEL: Record<string, string> = {
  groq: "Groq",
  gemini: "Gemini",
  openai: "OpenAI",
  claude: "Claude",
};

const DISPATCH: Record<string, (apiKey: string, prompt: string) => Promise<string>> = {
  groq: callGroq,
  gemini: callGemini,
  openai: callOpenAI,
  claude: callClaude,
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * The single entry point every AI feature calls. Same normalized shape back
 * no matter which provider ran it (spec section 4, rule: "SAME normalized format").
 * Never throws — failures come back as { success: false, error }.
 */
export async function callProvider(
  provider: string,
  apiKey: string,
  prompt: string
): Promise<AIResponse> {
  const label = PROVIDER_LABEL[provider];
  const fn = DISPATCH[provider];

  if (!fn || !label) {
    return { success: false, content: "", provider, error: `Unsupported provider "${provider}".` };
  }

  try {
    const content = await withTimeout(fn(apiKey, prompt), CALL_TIMEOUT_MS);
    return { success: true, content, provider };
  } catch {
    // Intentionally swallow the raw error — it can echo back key/account details.
    // Never log it anywhere (spec section 4, rule: "Never log key material").
    return {
      success: false,
      content: "",
      provider,
      error: `Your ${label} API key failed. Check key/limits in Settings.`,
    };
  }
}

/**
 * Runs a prompt using one of the user's saved keys. Decrypts server-side only,
 * right before the call — the plaintext key never leaves this function.
 *
 * Pass `provider` to force a specific one; otherwise the most recently
 * verified-working key is used.
 *
 * NOTE: no plan/entitlement gating here on purpose — the product is mid-pivot
 * from subscription tiers to an ad-unlock model. Whatever that check ends up
 * being, call it before runAI() in the route handler, not inside this module.
 */
export async function runAI(userId: string, prompt: string, provider?: string): Promise<AIResponse> {
  const key = await prisma.apiKey.findFirst({
    where: {
      userId,
      isActive: true,
      lastTestOk: true,
      ...(provider ? { provider } : {}),
    },
    orderBy: { lastTestedAt: "desc" },
  });

  if (!key) {
    return {
      success: false,
      content: "",
      provider: provider ?? "none",
      error: "No working AI key found. Add and test one in Settings.",
    };
  }

  const plainKey = decrypt(key.keyEncrypted);
  return callProvider(key.provider, plainKey, prompt);
}
