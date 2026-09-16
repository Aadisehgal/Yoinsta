import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { completeAdUnlock } from "@/lib/ads";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { nonce } = await req.json().catch(() => ({}));
  if (!nonce || typeof nonce !== "string") {
    return NextResponse.json({ error: "nonce is required." }, { status: 400 });
  }

  const result = await completeAdUnlock(session.user.id, nonce);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ unlocked: true });
}
