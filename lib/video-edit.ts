// Pure helpers for editing a YouTube video: reading API data into one tidy shape, validating what
// the person wants to change, and building the videos.update request. No network or framework
// imports on purpose — the rules here are the ones that decide whether YouTube accepts the edit.

export type Privacy = "public" | "unlisted" | "private";
export type VisibilityMode = Privacy | "schedule";

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX_BYTES = 5000;
export const TAGS_MAX_CHARS = 500;
export const TAG_MAX_CHARS = 100;
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- reading videos.list items

export interface RawVideoItem {
  id?: string;
  snippet?: {
    channelId?: string;
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  status?: {
    uploadStatus?: string;
    privacyStatus?: string;
    publishAt?: string;
    license?: string;
    embeddable?: boolean;
    publicStatsViewable?: boolean;
    selfDeclaredMadeForKids?: boolean;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

export interface EditableVideo {
  id: string;
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  privacyStatus: Privacy;
  publishAt: string | null;
  uploadStatus: string;
  embeddable: boolean;
  license: string;
  publicStatsViewable: boolean;
  selfDeclaredMadeForKids?: boolean;
  thumbnail: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  publishedAt: string;
}

/** "PT1H2M3S" -> seconds. Live/upcoming streams report "P0D" -> 0. */
export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

function bestThumbnail(thumbs: Record<string, { url?: string } | undefined> | undefined): string {
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const url = thumbs?.[key]?.url;
    if (url) return url;
  }
  return "";
}

export function normalizeVideo(raw: RawVideoItem | null | undefined): EditableVideo | null {
  if (!raw?.id || !raw.snippet) return null;
  const s = raw.snippet;
  const st = raw.status ?? {};

  const privacy: Privacy =
    st.privacyStatus === "public" || st.privacyStatus === "unlisted" || st.privacyStatus === "private"
      ? st.privacyStatus
      : "private";

  return {
    id: raw.id,
    channelId: s.channelId ?? "",
    title: s.title ?? "",
    description: s.description ?? "",
    tags: Array.isArray(s.tags) ? s.tags.filter((t) => typeof t === "string") : [],
    categoryId: s.categoryId ?? "22",
    defaultLanguage: s.defaultLanguage,
    defaultAudioLanguage: s.defaultAudioLanguage,
    privacyStatus: privacy,
    publishAt: st.publishAt ?? null,
    uploadStatus: st.uploadStatus ?? "processed",
    embeddable: st.embeddable ?? true,
    license: st.license ?? "youtube",
    publicStatsViewable: st.publicStatsViewable ?? true,
    selfDeclaredMadeForKids: st.selfDeclaredMadeForKids,
    thumbnail: bestThumbnail(s.thumbnails),
    views: Number(raw.statistics?.viewCount ?? 0),
    likes: Number(raw.statistics?.likeCount ?? 0),
    comments: Number(raw.statistics?.commentCount ?? 0),
    durationSeconds: parseIsoDuration(raw.contentDetails?.duration),
    publishedAt: s.publishedAt ?? "",
  };
}

// ---------------------------------------------------------------- tags

/** YouTube counts a tag that contains a space as if it were wrapped in quotes (+2). */
export function tagsLength(tags: string[]): number {
  return tags.reduce((sum, t) => sum + Array.from(t).length + (t.includes(" ") ? 2 : 0), 0);
}

/** Trim, drop '#', split on commas, remove empties and case-insensitive duplicates. */
export function cleanTags(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of input) {
    for (const piece of String(entry).split(",")) {
      const tag = piece.replace(/^#+/, "").replace(/\s+/g, " ").trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

// ---------------------------------------------------------------- validating an edit request

export interface EditRequest {
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: { mode: VisibilityMode; publishAt?: string };
}

export type ValidationResult = { ok: true; value: EditRequest } | { ok: false; error: string };

const bad = (error: string): ValidationResult => ({ ok: false, error });
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

export function validateEditRequest(input: unknown, now: Date = new Date()): ValidationResult {
  if (!input || typeof input !== "object") return bad("Send the fields you want to change.");
  const body = input as Record<string, unknown>;
  const value: EditRequest = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") return bad("Title must be text.");
    const title = body.title.replace(/\s+/g, " ").trim();
    if (!title) return bad("Title can't be empty.");
    if (Array.from(title).length > TITLE_MAX) return bad(`Title is too long (max ${TITLE_MAX} characters).`);
    if (/[<>]/.test(title)) return bad("Title can't contain the < or > characters.");
    value.title = title;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") return bad("Description must be text.");
    const description = body.description.replace(/\r\n/g, "\n").trim();
    if (utf8Length(description) > DESCRIPTION_MAX_BYTES) {
      return bad(`Description is too long (max ${DESCRIPTION_MAX_BYTES} bytes — about 5000 English characters).`);
    }
    if (/[<>]/.test(description)) return bad("Description can't contain the < or > characters.");
    value.description = description;
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) {
      return bad("Tags must be a list of text values.");
    }
    const tags = cleanTags(body.tags as string[]);
    if (tags.some((t) => /[<>]/.test(t))) return bad("Tags can't contain the < or > characters.");
    const tooLong = tags.find((t) => Array.from(t).length > TAG_MAX_CHARS);
    if (tooLong) return bad(`A tag is too long (max ${TAG_MAX_CHARS} characters): "${tooLong.slice(0, 30)}…"`);
    if (tagsLength(tags) > TAGS_MAX_CHARS) {
      return bad(`Tags use ${tagsLength(tags)} characters — YouTube allows at most ${TAGS_MAX_CHARS} in total.`);
    }
    value.tags = tags;
  }

  if (body.visibility !== undefined) {
    const v = body.visibility as { mode?: unknown; publishAt?: unknown } | null;
    const mode = v?.mode;
    if (mode !== "public" && mode !== "unlisted" && mode !== "private" && mode !== "schedule") {
      return bad("Visibility must be public, unlisted, private or schedule.");
    }
    if (mode === "schedule") {
      if (typeof v?.publishAt !== "string") return bad("Pick a date and time to schedule.");
      const when = new Date(v.publishAt);
      if (Number.isNaN(when.getTime())) return bad("That schedule time isn't valid.");
      if (when.getTime() < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
        return bad("Schedule time must be at least 5 minutes from now.");
      }
      value.visibility = { mode, publishAt: when.toISOString() };
    } else {
      value.visibility = { mode };
    }
  }

  if (Object.keys(value).length === 0) return bad("Nothing to change.");
  return { ok: true, value };
}

// ---------------------------------------------------------------- building the videos.update call

export interface UpdatePayload {
  parts: string[];
  body: Record<string, unknown>;
}

/**
 * videos.update REPLACES every writable field of each part it is given, so we always send the
 * full current snippet / status with the person's changes merged in. A part that wasn't touched
 * is left out entirely — e.g. a title edit never disturbs a scheduled publish time.
 */
export function buildUpdatePayload(current: EditableVideo, req: EditRequest): UpdatePayload {
  const body: Record<string, unknown> = { id: current.id };
  const parts: string[] = [];

  if (req.title !== undefined || req.description !== undefined || req.tags !== undefined) {
    const snippet: Record<string, unknown> = {
      title: req.title ?? current.title,
      description: req.description ?? current.description,
      tags: req.tags ?? current.tags,
      categoryId: current.categoryId,
    };
    if (current.defaultLanguage) snippet.defaultLanguage = current.defaultLanguage;
    if (current.defaultAudioLanguage) snippet.defaultAudioLanguage = current.defaultAudioLanguage;
    body.snippet = snippet;
    parts.push("snippet");
  }

  if (req.visibility) {
    const { mode, publishAt } = req.visibility;
    const status: Record<string, unknown> = {
      privacyStatus: mode === "schedule" ? "private" : mode,
      embeddable: current.embeddable,
      license: current.license,
      publicStatsViewable: current.publicStatsViewable,
    };
    if (current.selfDeclaredMadeForKids !== undefined) {
      status.selfDeclaredMadeForKids = current.selfDeclaredMadeForKids;
    }
    if (mode === "schedule" && publishAt) status.publishAt = publishAt;
    body.status = status;
    parts.push("status");
  }

  return { parts, body };
}

// ---------------------------------------------------------------- thumbnails

/** Reads the file's first bytes instead of trusting the browser-supplied type. */
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  return null;
}

// ---------------------------------------------------------------- turning YouTube errors into messages

export type FailureCode =
  | "needs_reconnect"
  | "quota"
  | "not_verified"
  | "not_found"
  | "invalid"
  | "forbidden"
  | "unknown";

export interface Failure {
  code: FailureCode;
  httpStatus: number;
  message: string;
}

export function describeYouTubeFailure(
  status: number,
  reason: string | undefined,
  apiMessage: string | undefined,
  context: "video" | "thumbnail" = "video"
): Failure {
  const msg = (apiMessage ?? "").slice(0, 200);
  const lower = msg.toLowerCase();

  if (
    reason === "insufficientPermissions" ||
    reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    lower.includes("insufficient authentication scopes") ||
    lower.includes("insufficient permission")
  ) {
    return {
      code: "needs_reconnect",
      httpStatus: 403,
      message: "Editing needs an extra YouTube permission. Reconnect YouTube once and allow it.",
    };
  }
  if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason ?? "")) {
    return { code: "quota", httpStatus: 429, message: "YouTube's daily limit is used up. Try again tomorrow." };
  }
  if (context === "thumbnail" && (status === 403 || reason === "forbidden") && lower.includes("thumbnail")) {
    return {
      code: "not_verified",
      httpStatus: 403,
      message: "YouTube only allows custom thumbnails on verified channels. Verify yours at youtube.com/verify, then retry.",
    };
  }
  if (status === 404 || reason === "videoNotFound" || reason === "notFound") {
    return { code: "not_found", httpStatus: 404, message: "That video wasn't found on your channel." };
  }
  if (reason === "invalidPublishAt" || lower.includes("publishat")) {
    return {
      code: "invalid",
      httpStatus: 400,
      message:
        "YouTube didn't accept that schedule time. Only private videos that were never public can be scheduled, and the time must be in the future.",
    };
  }
  if (status === 400 || (reason ?? "").startsWith("invalid")) {
    return {
      code: "invalid",
      httpStatus: 400,
      message: msg ? `YouTube rejected the change: ${msg}` : "YouTube rejected the change.",
    };
  }
  if (status === 401) {
    return {
      code: "needs_reconnect",
      httpStatus: 401,
      message: "YouTube sign-in expired. Reconnect YouTube and try again.",
    };
  }
  if (status === 403) {
    return { code: "forbidden", httpStatus: 403, message: "YouTube didn't allow this action for your channel." };
  }
  return { code: "unknown", httpStatus: 502, message: "Couldn't reach YouTube right now. Try again in a minute." };
}
