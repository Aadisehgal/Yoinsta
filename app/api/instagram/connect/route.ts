import crypto from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAuthorizeUrl } from "@/lib/instagram-api";

/** Sends the person to Instagram's own login + permission screen (Instagram API with Instagram Login). */
export async function GET() {
  const base = process.env.NEXTAUTH_URL as string;
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login?callbackUrl=%2Fapi%2Finstagram%2Fconnect", base));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const url = buildAuthorizeUrl(state);
  if (!url) return NextResponse.redirect(new URL("/dashboard/instagram?ig=not_configured", base));

  const response = NextResponse.redirect(url);
  // Checked again in the callback — stops a forged callback from linking someone else's Instagram to this session.
  response.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes to finish Instagram's screens
    path: "/",
  });
  return response;
}
