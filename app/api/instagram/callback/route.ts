import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { InstagramApiError, exchangeCodeForToken, exchangeForLongLived, fetchProfile } from "@/lib/instagram-api";
import { instagramCacheKeys, saveInstagramConnection } from "@/lib/instagram";

const PROFESSIONAL = new Set(["BUSINESS", "MEDIA_CREATOR", "CREATOR"]);

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL as string;
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/dashboard/instagram?ig=${status}`, base));
    res.cookies.delete("ig_oauth_state");
    return res;
  };

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login?callbackUrl=%2Fdashboard%2Finstagram", base));

  const { searchParams } = req.nextUrl;
  const rawCode = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = req.cookies.get("ig_oauth_state")?.value;

  if (searchParams.get("error")) return back("denied");
  if (!rawCode || !state || !cookieState || state !== cookieState) return back("expired");

  try {
    // Instagram appends "#_" to the redirect; browsers don't send it, but strip it if it ever arrives.
    const short = await exchangeCodeForToken(rawCode.replace(/#_$/, ""));
    const long = await exchangeForLongLived(short.token);
    const profile = await fetchProfile(long.token);
    if (!profile.igUserId) return back("error");
    if (profile.accountType && !PROFESSIONAL.has(profile.accountType.toUpperCase())) return back("not_professional");

    await saveInstagramConnection(session.user.id, profile, long.token, long.expiresIn);
    await redis.del(...instagramCacheKeys(session.user.id, profile.igUserId)).catch(() => 0);
    return back("connected");
  } catch (err) {
    // Log only the numeric codes — never the token or Instagram's free-text message.
    console.error("[instagram/callback]", err instanceof InstagramApiError ? err.message : "unexpected error");
    return back("error");
  }
}
