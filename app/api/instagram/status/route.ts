import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { instagramConfig } from "@/lib/instagram-api";
import { getInstagramChannel } from "@/lib/instagram";
import { isExpired, unpackToken } from "@/lib/instagram-token";

/** Is Instagram set up on the server, and is this person connected? (No Instagram calls — instant.) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const configured = instagramConfig() !== null;
  const channel = await getInstagramChannel(session.user.id);
  let needsReconnect = false;
  if (channel?.accessTokenEnc) {
    const stored = unpackToken(decrypt(channel.accessTokenEnc), Math.floor(Date.now() / 1000));
    needsReconnect = !stored || isExpired(stored, Math.floor(Date.now() / 1000));
  }
  return NextResponse.json({ configured, connected: Boolean(channel), username: channel?.title ?? null, needsReconnect });
}
