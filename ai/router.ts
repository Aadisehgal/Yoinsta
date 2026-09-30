import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { callGroq, chatGroq } from "./providers/groq";
import { callGemini, chatGemini } from "./providers/gemini";
import { callOpenAI, chatOpenAI } from "./providers/openai";
import { callClaude, chatClaude } from "./providers/claude";
import type { AIResponse, ChatMessage } from "./types";

const CALL_TIMEOUT_MS = 20_000;
// Channel-audit prompts are much bigger, and newer Gemini models "think" before answering.
const CHAT_TIMEOUT_MS = 50_000;

/**
 * Turns a provider failure into a message that says what actually went wrong, using
 * only the HTTP status / a timeout marker — never the raw error text, which can echo
 * key or account details.
 */
function describeFailure(label: string, err: unknown): string {
  const e = err as { message?: string; status?: number; detail?: string } | undefined;
  // `detail` is built by our own provider code (model names + status codes only) — safe to show.
  const trail = typeof e?.detail === "string" && e.detail ? ` [${e.detail}]` : "";

  if (e?.message === "TIMEOUT") {
    return `${label} took too long to answer. Try again, or ask something shorter.`;
  }
  if (e?.message === "EMPTY_RESPONSE") {
    return `${label} sent back an empty answer. Try rephrasing your question.`;
  }
  const status = typeof e?.status === "number" ? e.status : undefined;
  if (status === 401 || status === 403) {
    return `${label} rejected your API key (HTTP ${status}). Re-check the key in Settings.${trail}`;
  }
  if (status === 404) {
    return `${label} couldn't find the model this app asked for (HTTP 404). The app needs a model update.${trail}`;
  }
  if (status === 429) {
    return `${label} rate limit or quota reached (HTTP 429). Wait a minute, or check your ${label} plan limits.${trail}`;
  }
  if (status === 400) {
    return `${label} rejected the request (HTTP 400).${trail}`;
  }
  if (status !== undefined && status >= 500) {
    return `${label} is busy or down on its side (HTTP ${status}) — not a problem with your key. Try again in a minute.${trail}`;
  }
  return `Your ${label} API key failed. Check key/limits in Settings.`;
}

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
  } catch (err) {
    // Intentionally never surface or log the raw error — it can echo back key/account
    // details (spec section 4, rule: "Never log key material"). Only the HTTP status
    // / timeout marker is used to pick a message.
    return {
      success: false,
      content: "",
      provider,
      error: describeFailure(label, err),
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
    const content = await withTimeout(fn(apiKey, systemPrompt, messages), CHAT_TIMEOUT_MS);
    return { success: true, content, provider };
  } catch (err) {
    return {
      success: false,
      content: "",
      provider,
      error: describeFailure(label, err),
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
