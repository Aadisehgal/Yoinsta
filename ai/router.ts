import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { callGroq, chatGroq } from "./providers/groq";
import { callGemini, chatGemini } from "./providers/gemini";
import { callOpenAI, chatOpenAI } from "./providers/openai";
import { callClaude, chatClaude } from "./providers/claude";
import type { AIResponse, ChatMessage } from "./types";

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

const CHAT_DISPATCH: Record<string, (apiKey: string, systemPrompt: string, messages: ChatMessage[]) => Promise<string>> = {
  groq: chatGroq,
  gemini: chatGemini,
  openai: chatOpenAI,
  claude: chatClaude,
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

/** Same contract as callProvider, but for a multi-turn conversation with a system prompt. */
export async function callProviderChat(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<AIResponse> {
  const label = PROVIDER_LABEL[provider];
  const fn = CHAT_DISPATCH[provider];

  if (!fn || !label) {
    return { success: false, content: "", provider, error: `Unsupported provider "${provider}".` };
  }

  try {
    const content = await withTimeout(fn(apiKey, systemPrompt, messages), CALL_TIMEOUT_MS);
    return { success: true, content, provider };
  } catch {
    return {
      success: false,
      content: "",
      provider,
      error: `Your ${label} API key failed. Check key/limits in Settings.`,
    };
  }
}

/** Chat version of runAI — used by the Channel Audit assistant. */
export async function runChat(
  userId: string,
  systemPrompt: string,
  messages: ChatMessage[],
  provider?: string
): Promise<AIResponse> {
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
  return callProviderChat(key.provider, plainKey, systemPrompt, messages);
}
