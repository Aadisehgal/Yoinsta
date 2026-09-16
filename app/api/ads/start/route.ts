import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUnlocked, startAdUnlock } from "@/lib/ads";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { resourceKey } = await req.json().catch(() => ({}));
  if (!resourceKey || typeof resourceKey !== "string") {
    return NextResponse.json({ error: "resourceKey is required." }, { status: 400 });
  }

  if (await isUnlocked(session.user.id, resourceKey)) {
    return NextResponse.json({ alreadyUnlocked: true });
  }

  const { nonce } = await startAdUnlock(session.user.id, resourceKey);
  return NextResponse.json({ nonce });
}
