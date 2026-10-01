import { normalizeVideo, buildUpdatePayload, type EditableVideo, type EditRequest, type RawVideoItem } from "@/lib/video-edit";

const API = "https://www.googleapis.com/youtube/v3";

/** A failed YouTube call, keeping only the safe bits (HTTP status, Google's reason code and message). */
export class YouTubeApiError extends Error {
  status: number;
  reason?: string;
  apiMessage?: string;

  constructor(status: number, reason?: string, apiMessage?: string) {
    super(`YouTube API error ${status}${reason ? ` (${reason})` : ""}`);
    this.status = status;
    this.reason = reason;
    this.apiMessage = apiMessage;
  }
}

async function ytFetch<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const extraHeaders = (init.headers ?? {}) as Record<string, string>;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
  });

  if (!res.ok) {
    let reason: string | undefined;
    let message: string | undefined;
    try {
      const data = await res.json();
      reason = data?.error?.errors?.[0]?.reason;
      message = data?.error?.message;
    } catch {
      // body wasn't JSON — status alone is enough
    }
    throw new YouTubeApiError(res.status, reason, message);
  }
  return (await res.json()) as T;
}

export interface ManagedVideoPage {
  videos: EditableVideo[];
  nextPageToken?: string;
}

/** One page of the channel's uploads (public, unlisted, private and scheduled) — 2 quota units. */
export async function listManagedVideos(
  accessToken: string,
  uploadsPlaylistId: string,
  pageToken?: string,
  pageSize = 20
): Promise<ManagedVideoPage> {
  const params = new URLSearchParams({
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: String(pageSize),
  });
  if (pageToken) params.set("pageToken", pageToken);

  const page = await ytFetch<{
    items?: { contentDetails?: { videoId?: string } }[];
    nextPageToken?: string;
  }>(accessToken, `${API}/playlistItems?${params.toString()}`);

  const ids = (page.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { videos: [], nextPageToken: page.nextPageToken };

  const details = await ytFetch<{ items?: RawVideoItem[] }>(
    accessToken,
    `${API}/videos?${new URLSearchParams({
      part: "snippet,status,statistics,contentDetails",
      id: ids.join(","),
    }).toString()}`
  );

  // videos.list doesn't promise the same order as the playlist — restore it (newest first).
  const byId = new Map<string, EditableVideo>();
  for (const raw of details.items ?? []) {
    const video = normalizeVideo(raw);
    if (video) byId.set(video.id, video);
  }
  const videos = ids.map((id) => byId.get(id)).filter((v): v is EditableVideo => Boolean(v));
  return { videos, nextPageToken: page.nextPageToken };
}

/** Full editable details for one video — 1 quota unit. Null if it doesn't exist / isn't visible. */
export async function getEditableVideo(accessToken: string, videoId: string): Promise<EditableVideo | null> {
  const data = await ytFetch<{ items?: RawVideoItem[] }>(
    accessToken,
    `${API}/videos?${new URLSearchParams({
      part: "snippet,status,statistics,contentDetails",
      id: videoId,
    }).toString()}`
  );
  return normalizeVideo(data.items?.[0]);
}

/** Applies the edit (50 quota units), then re-reads the video so the caller gets the saved state. */
export async function updateVideo(
  accessToken: string,
  current: EditableVideo,
  request: EditRequest
): Promise<EditableVideo> {
  const { parts, body } = buildUpdatePayload(current, request);
  await ytFetch<unknown>(accessToken, `${API}/videos?part=${parts.join(",")}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const saved = await getEditableVideo(accessToken, current.id);
  if (!saved) throw new YouTubeApiError(404, "videoNotFound");
  return saved;
}

/** Uploads a custom thumbnail (50 quota units). Returns the new thumbnail URL when YouTube sends one. */
export async function setVideoThumbnail(
  accessToken: string,
  videoId: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<string | null> {
  const url = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(
    videoId
  )}&uploadType=media`;

  const data = await ytFetch<{
    items?: Record<string, { url?: string } | undefined>[];
  }>(accessToken, url, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: bytes as unknown as BodyInit,
  });

  const t = data.items?.[0];
  return t?.maxres?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;
}
