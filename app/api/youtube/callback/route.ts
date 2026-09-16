import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { exchangeCodeForTokens, getMyChannel } from "@/lib/youtube";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL as string;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/dashboard?youtube_error=${encodeURIComponent(reason)}`, base));

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", base));

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const cookieState = req.cookies.get("yt_oauth_state")?.value;

  if (oauthError) return fail("YouTube connection was cancelled.");
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("This connection request expired or was invalid. Please try again.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return fail(
        "Google didn't grant offline access. Remove Yoinsta from your Google account's connected apps, then reconnect."
      );
    }

    const channel = await getMyChannel(tokens.access_token);

    await prisma.channel.upsert({
      where: {
        userId_platform_platformId: {
          userId: session.user.id,
          platform: "youtube",
          platformId: channel.id,
        },
      },
      create: {
        userId: session.user.id,
        platform: "youtube",
        platformId: channel.id,
        title: channel.title,
        thumbnail: channel.thumbnail,
        accessTokenEnc: encrypt(tokens.refresh_token),
      },
      update: {
        title: channel.title,
        thumbnail: channel.thumbnail,
        accessTokenEnc: encrypt(tokens.refresh_token),
      },
    });

    // Force a fresh fetch on the next dashboard load instead of showing stale/empty cache.
    await redis.del(`yt:dashboard:${session.user.id}`, `yt:videos:${session.user.id}`);

    const response = NextResponse.redirect(new URL("/dashboard", base));
    response.cookies.delete("yt_oauth_state");
    return response;
  } catch {
    return fail("Couldn't connect your YouTube channel. Please try again.");
  }
}
