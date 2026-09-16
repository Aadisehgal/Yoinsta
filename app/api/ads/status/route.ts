import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isUnlocked } from "@/lib/ads";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const resourceKey = new URL(req.url).searchParams.get("resourceKey");
  if (!resourceKey) {
    return NextResponse.json({ error: "resourceKey is required." }, { status: 400 });
  }

  return NextResponse.json({ unlocked: await isUnlocked(session.user.id, resourceKey) });
}
