import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, maskSecret } from "@/lib/encryption";
import { callProvider } from "@/ai/router";

const VALID_PROVIDERS = ["groq", "gemini", "openai", "claude"];
const TEST_PROMPT = "Reply with only the single word: OK";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  // Masked/status only — the encrypted key material never goes to the client.
  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      provider: true,
      isActive: true,
      lastTestedAt: true,
      lastTestOk: true,
    },
  });

  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { provider, apiKey } = body as { provider?: string; apiKey?: string };

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }

  // Test BEFORE saving so a bad key never sits there looking "connected".
  const test = await callProvider(provider, apiKey, TEST_PROMPT);

  const saved = await prisma.apiKey.upsert({
    where: { userId_provider: { userId: session.user.id, provider } },
    create: {
      userId: session.user.id,
      provider,
      keyEncrypted: encrypt(apiKey),
      lastTestedAt: new Date(),
      lastTestOk: test.success,
    },
    update: {
      keyEncrypted: encrypt(apiKey),
      isActive: true,
      lastTestedAt: new Date(),
      lastTestOk: test.success,
    },
  });

  return NextResponse.json({
    id: saved.id,
    provider: saved.provider,
    masked: maskSecret(apiKey),
    testOk: test.success,
    error: test.success ? undefined : test.error,
  });
}
