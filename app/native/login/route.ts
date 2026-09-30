import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Step 1 of "sign in from the Android app". The app opens this URL in a Chrome Custom Tab
 * (a real browser, so Google allows sign-in there) with a PKCE-style challenge. We keep the
 * challenge in a short-lived cookie, then send the person through the normal login page.
 */
export async function GET(req: Request) {
  const challenge = new URL(req.url).searchParams.get("challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const base = process.env.NEXTAUTH_URL as string;
  const session = await getServerSession(authOptions);
  // Already signed in inside this browser? Skip the login page.
  const next = session ? "/native/handoff" : "/login?callbackUrl=%2Fnative%2Fhandoff";

  const response = NextResponse.redirect(new URL(next, base));
  response.cookies.set("native_challenge", challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes to finish Google sign-in
    path: "/",
  });
  return response;
}
