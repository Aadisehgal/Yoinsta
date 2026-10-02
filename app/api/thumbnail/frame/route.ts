import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VIDEO_ID = /^[\w-]{11}$/;
// Best picture first; hqdefault exists for every video.
const SIZES = ["maxresdefault", "sddefault", "hqdefault"];
const MAX_BYTES = 4_000_000;

/**
 * Hands the Thumbnail Maker a video's picture from our own domain. Loading it straight from YouTube would
 * stop the browser from saving the finished thumbnail (cross-origin pictures "taint" a canvas). Only the
 * fixed YouTube image host is ever contacted, and only for a valid 11-character video ID.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!VIDEO_ID.test(id)) return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });

  for (const size of SIZES) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) continue;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) continue;
      return new NextResponse(bytes, {
        headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
      });
    } catch {
      // try the next size
    }
  }
  return NextResponse.json({ error: "Couldn't load that video's picture." }, { status: 404 });
}
