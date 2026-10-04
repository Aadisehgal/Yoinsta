import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadIntelligence } from "@/lib/competitors";
import { buildInsights } from "@/lib/competitor-metrics";
import { getUserAccessToken } from "@/lib/youtube";

// Reads up to 6 channels' recent uploads (cached for hours) — give it room on a cold cache.
export const maxDuration = 30;

/** Numbers that compare the creator with the competitors they track: averages, upload rhythm, outliers, growth. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const accessToken = await getUserAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect your YouTube channel first (Dashboard)." }, { status: 400 });
  }

  try {
    const intel = await loadIntelligence(session.user.id, accessToken);
    return NextResponse.json({ ...intel, insights: buildInsights(intel.you, intel.competitors) });
  } catch {
    return NextResponse.json({ error: "Couldn't read the competitors' videos right now. Try again in a minute." }, { status: 502 });
  }
}
