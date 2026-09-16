import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { callProvider } from "@/ai/router";

const TEST_PROMPT = "Reply with only the single word: OK";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { provider } = await req.json().catch(() => ({}));
  if (!provider || typeof provider !== "string") {
    return NextResponse.json({ error: "provider is required." }, { status: 400 });
  }

  const key = await prisma.apiKey.findUnique({
    where: { userId_provider: { userId: session.user.id, provider } },
  });
  if (!key) return NextResponse.json({ error: "No key saved for this provider." }, { status: 404 });

  const plainKey = decrypt(key.keyEncrypted);
  const test = await callProvider(provider, plainKey, TEST_PROMPT);

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastTestedAt: new Date(), lastTestOk: test.success },
  });

  return NextResponse.json({ testOk: test.success, error: test.success ? undefined : test.error });
}
