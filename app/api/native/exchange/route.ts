import crypto from "crypto";
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // NextAuth's default session length (30 days)
const CHALLENGE_SHAPE = /^[A-Za-z0-9_-]{43}$/; // base64url of a 32-byte value

/**
 * Step 3: the Android app loads this URL in its WebView with the one-time `code` from the
 * deep link plus the secret `verifier` it generated at the start. Both must match, the code
 * is single-use, and it expires after 2 minutes — so a code copied out of the deep link is
 * useless to any other app or device.
 */
export async function GET(req: Request) {
  const base = process.env.NEXTAUTH_URL as string;
  const fail = () => NextResponse.redirect(new URL("/login?error=NativeLogin", base));

  const params = new URL(req.url).searchParams;
  const code = params.get("code") ?? "";
  const verifier = params.get("verifier") ?? "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(code) || !CHALLENGE_SHAPE.test(verifier)) return fail();

  // Single use: read and delete in one round trip.
  const key = `native:code:${crypto.createHash("sha256").update(code).digest("hex")}`;
  const results = await redis.multi().get(key).del(key).exec();
  const raw = results?.[0]?.[1];
  if (typeof raw !== "string") return fail();

  let saved: { email?: string; challenge?: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail();
  }
  if (!saved.email || !saved.challenge) return fail();

  const expected = Buffer.from(saved.challenge);
  const actual = Buffer.from(crypto.createHash("sha256").update(verifier).digest("base64url"));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return fail();

  const user = await prisma.user.findUnique({ where: { email: saved.email } });
  if (!user) return fail();

  // Same token shape NextAuth itself issues; the jwt callback in lib/auth.ts re-reads
  // role / adFree from the database on every request, so nothing else is needed here.
  const token = await encode({
    token: { sub: user.id, email: user.email, name: user.name, picture: user.image },
    secret: process.env.NEXTAUTH_SECRET as string,
    maxAge: SESSION_MAX_AGE,
  });

  const secure = base.startsWith("https://");
  const response = NextResponse.redirect(new URL("/dashboard", base));
  response.cookies.set(`${secure ? "__Secure-" : ""}next-auth.session-token`, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
