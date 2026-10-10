import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { describeInstagramFailure } from "@/lib/instagram-api";
import { loadInstagramOverview } from "@/lib/instagram";

// A cold load reads the profile, up to 20 posts and each post's insights.
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const tzRaw = Number(params.get("tz") ?? 0);
  const tz = Number.isInteger(tzRaw) && Math.abs(tzRaw) <= 14 * 60 ? tzRaw : 0;

  try {
    const overview = await loadInstagramOverview(session.user.id, tz, params.get("refresh") === "1");
    if (!overview) return NextResponse.json({ connected: false });
    return NextResponse.json({ connected: true, ...overview });
  } catch (err) {
    const f = describeInstagramFailure(err);
    return NextResponse.json({ connected: true, error: f.message, code: f.code }, { status: f.httpStatus });
  }
}
