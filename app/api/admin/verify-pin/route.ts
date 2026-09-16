import { NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-log";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  // Server-side re-check — never trust the middleware pass alone (rule 6).
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { pin } = await req.json().catch(() => ({ pin: "" }));
  const expected = process.env.ADMIN_PIN ?? "";

  if (typeof pin !== "string" || !pin || !timingSafeEqual(pin, expected)) {
    await logAdminAction(session.user.id, "ADMIN_PIN_FAILED");
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  await logAdminAction(session.user.id, "ADMIN_PIN_VERIFIED");

  // Client finishes the flow by calling next-auth's session update({ adminPinOk: true }),
  // which re-signs the JWT via the jwt() callback trigger === "update".
  return NextResponse.json({ ok: true });
}
