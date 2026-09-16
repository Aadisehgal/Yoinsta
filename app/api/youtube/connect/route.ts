import { NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildYouTubeAuthUrl } from "@/lib/youtube";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL as string));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildYouTubeAuthUrl(state));

  // Verified against the callback's `state` query param — stops a forged callback
  // from linking someone else's YouTube channel to this session.
  response.cookies.set("yt_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes to complete the consent screen
    path: "/",
  });

  return response;
}
