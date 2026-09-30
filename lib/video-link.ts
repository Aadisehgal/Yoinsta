// Reads a pasted YouTube link and fetches the video's public title/channel via oEmbed (no API key needed).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
}

export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (VIDEO_ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const [, first, second] = url.pathname.split("/");
  let id: string | null = null;

  if (host === "youtu.be") {
    id = first ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "shorts" || first === "embed" || first === "live" || first === "v") id = second ?? null;
  }

  return id && VIDEO_ID.test(id) ? id : null;
}

export async function fetchVideoMeta(id: string): Promise<VideoMeta | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.title !== "string" || !data.title) return null;
    return { id, title: data.title, channel: typeof data.author_name === "string" ? data.author_name : "" };
  } catch {
    return null;
  }
}
