// Reads a pasted YouTube link, fetches the video's public title/channel via oEmbed (no API key needed),
// and looks up the channel's profile icon.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
  channelUrl: string | null;
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
    return {
      id,
      title: data.title,
      channel: typeof data.author_name === "string" ? data.author_name : "",
      channelUrl: typeof data.author_url === "string" ? data.author_url : null,
    };
  } catch {
    return null;
  }
}

// Channel icons only ever come from Google's image hosts; refuse anything else.
function isChannelImage(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && /(^|\.)(ggpht|googleusercontent)\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function getJson(url: string, ms: number) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Most reliable source: the YouTube Data API, when the project has a key in its env.
async function iconFromApi(videoId: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY || process.env.YT_API_KEY;
  if (!key) return null;
  const k = encodeURIComponent(key);
  const video = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${k}`, 4000);
  const channelId = video?.items?.[0]?.snippet?.channelId;
  if (typeof channelId !== "string") return null;
  const channel = await getJson(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${k}`,
    4000
  );
  const thumbs = channel?.items?.[0]?.snippet?.thumbnails;
  return thumbs?.medium?.url ?? thumbs?.default?.url ?? null;
}

// Fallback without a key: the channel page's og:image is the channel icon.
async function iconFromChannelPage(channelUrl: string): Promise<string | null> {
  const u = new URL(channelUrl);
  if (u.protocol !== "https:" || u.hostname !== "www.youtube.com") return null;
  const res = await fetch(u.toString(), {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  return match ? match[1].replace(/&amp;/g, "&").replace(/=s\d+/, "=s176") : null;
}

// Never throws: returns null when no source works, and the page shows a letter badge instead.
export async function fetchChannelIcon(videoId: string, channelUrl: string | null): Promise<string | null> {
  const sources = [() => iconFromApi(videoId), () => (channelUrl ? iconFromChannelPage(channelUrl) : null)];
  for (const source of sources) {
    try {
      const url = await source();
      if (url && isChannelImage(url)) return url;
    } catch {
      // try the next source
    }
  }
  return null;
}
