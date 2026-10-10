// Thin client for the Instagram API with Instagram Login (graph.instagram.com). Only the pieces Yoinsta needs:
// the OAuth steps, the profile, recent posts and their insights. Errors keep just Meta's numeric codes —
// never the token — so they are safe to map to messages.

import {
  buildPost,
  parseInsightValues,
  type AccountInsights,
  type IgProfile,
  type RawMedia,
} from "@/lib/instagram-metrics";

const GRAPH = "https://graph.instagram.com";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";

export const IG_VERSION = process.env.INSTAGRAM_API_VERSION ?? "v25.0";
// Read-only: profile, posts and insights. (Publishing / comments / messages need more permissions and app review.)
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];

export class InstagramApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;

  constructor(status: number, code?: number, subcode?: number) {
    super(`Instagram API error ${status}${code ? ` (code ${code})` : ""}`);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

export function instagramConfig(): { appId: string; appSecret: string } | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function redirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/instagram/callback`;
}

/** force_reauth makes Instagram ask for the login again, so the person picks the right account every time. */
export function buildAuthorizeUrl(state: string): string | null {
  const cfg = instagramConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
    force_reauth: "true",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function readError(res: Response): Promise<InstagramApiError> {
  let code: number | undefined;
  let subcode: number | undefined;
  try {
    const data = await res.json();
    const e = data?.error ?? data;
    code = typeof e?.code === "number" ? e.code : undefined;
    subcode = typeof e?.error_subcode === "number" ? e.error_subcode : undefined;
  } catch {
    // body wasn't JSON — the HTTP status alone is enough
  }
  return new InstagramApiError(res.status, code, subcode);
}

async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${IG_VERSION}/${path}?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- OAuth

/** Step 1 after consent: the one-time code from the redirect becomes a short-lived (1 hour) token. */
export async function exchangeCodeForToken(code: string): Promise<{ token: string; userId: string }> {
  const cfg = instagramConfig();
  if (!cfg) throw new InstagramApiError(503);
  const body = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await readError(res);
  const json = (await res.json()) as { access_token?: string; user_id?: number | string; data?: { access_token?: string; user_id?: number | string }[] };
  const first = json.data?.[0] ?? json; // newer answers wrap the result in {data:[…]}
  if (!first.access_token) throw new InstagramApiError(502);
  return { token: first.access_token, userId: String(first.user_id ?? "") };
}

/** Step 2 (server side only — uses the app secret): short-lived → long-lived (60 days). */
export async function exchangeForLongLived(shortToken: string): Promise<{ token: string; expiresIn: number }> {
  const cfg = instagramConfig();
  if (!cfg) throw new InstagramApiError(503);
  const qs = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.appSecret, access_token: shortToken });
  const res = await fetch(`${GRAPH}/access_token?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await readError(res);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new InstagramApiError(502);
  return { token: json.access_token, expiresIn: json.expires_in ?? 60 * 86_400 };
}

/** A long-lived token that is at least a day old can be refreshed for another 60 days. */
export async function refreshLongLived(token: string): Promise<{ token: string; expiresIn: number }> {
  const qs = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const res = await fetch(`${GRAPH}/refresh_access_token?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await readError(res);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new InstagramApiError(502);
  return { token: json.access_token, expiresIn: json.expires_in ?? 60 * 86_400 };
}

// ---------------------------------------------------------------- data

export async function fetchProfile(token: string): Promise<IgProfile> {
  const j = await graphGet<{
    user_id?: string | number;
    id?: string;
    username?: string;
    name?: string;
    account_type?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  }>("me", token, {
    fields: "user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count",
  });
  return {
    igUserId: String(j.user_id ?? j.id ?? ""),
    username: j.username ?? "",
    name: j.name ?? "",
    accountType: j.account_type ?? "",
    picture: j.profile_picture_url ?? "",
    followers: j.followers_count ?? 0,
    following: j.follows_count ?? 0,
    mediaCount: j.media_count ?? 0,
  };
}

export async function fetchRecentMedia(token: string, limit = 20): Promise<RawMedia[]> {
  const j = await graphGet<{ data?: RawMedia[] }>("me/media", token, {
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  });
  return j.data ?? [];
}

const CORE_METRICS = "reach,views,likes,comments,shares,saved,total_interactions";
const BASIC_METRICS = "reach,likes,comments,shares,saved,total_interactions";

async function tryInsights(token: string, mediaId: string, metrics: string): Promise<Record<string, number> | null> {
  try {
    return parseInsightValues(await graphGet<unknown>(`${mediaId}/insights`, token, { metric: metrics }));
  } catch (err) {
    // Rate limits and expired tokens are real problems the caller must see; "this metric isn't available for
    // this post" (code 100 and friends) just means we try something smaller.
    if (err instanceof InstagramApiError && (err.code === 190 || err.status === 401 || err.code === 4 || err.code === 17 || err.code === 613 || err.status === 429)) {
      throw err;
    }
    return null;
  }
}

/** Numbers for one post. Full set first, a smaller set if Instagram refuses some metric, null if nothing works. */
export async function fetchMediaInsights(token: string, media: RawMedia): Promise<Record<string, number> | null> {
  if (!media.id) return null;
  const isReel = media.media_product_type === "REELS";
  const main =
    (await tryInsights(token, media.id, isReel ? `${CORE_METRICS},ig_reels_avg_watch_time` : CORE_METRICS)) ??
    (await tryInsights(token, media.id, BASIC_METRICS));
  if (!main) return null;
  if (isReel) {
    // Best effort: how many viewers leave in the first 3 seconds (a newer metric, so it may be unavailable).
    const skip = await tryInsights(token, media.id, "reels_skip_rate");
    if (skip) Object.assign(main, skip);
  }
  return main;
}

export async function fetchAccountInsights(token: string, days = 28, nowMs = Date.now()): Promise<AccountInsights | null> {
  const until = Math.floor(nowMs / 1000);
  const since = until - days * 86_400;
  try {
    const m = parseInsightValues(
      await graphGet<unknown>("me/insights", token, {
        metric: "reach,views,accounts_engaged,total_interactions",
        period: "day",
        metric_type: "total_value",
        since: String(since),
        until: String(until),
      })
    );
    return {
      days,
      reach: m.reach ?? null,
      views: m.views ?? null,
      accountsEngaged: m.accounts_engaged ?? null,
      totalInteractions: m.total_interactions ?? null,
    };
  } catch (err) {
    if (err instanceof InstagramApiError && (err.code === 190 || err.status === 401)) throw err;
    return null; // account-level numbers are a bonus
  }
}

export { buildPost };

// ---------------------------------------------------------------- turning failures into messages

export type IgFailureCode = "needs_reconnect" | "rate_limited" | "permission" | "unknown";

export function describeInstagramFailure(err: unknown): { code: IgFailureCode; message: string; httpStatus: number } {
  const e = err instanceof InstagramApiError ? err : null;
  if (e && (e.code === 190 || e.status === 401 || e.code === 102)) {
    return { code: "needs_reconnect", message: "Instagram sign-in expired. Reconnect Instagram and try again.", httpStatus: 401 };
  }
  if (e && (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613 || e.status === 429)) {
    return { code: "rate_limited", message: "Instagram says too many requests. Wait a few minutes and try again.", httpStatus: 429 };
  }
  if (e && (e.code === 10 || e.code === 200 || e.code === 3 || e.code === 299 || e.status === 403)) {
    return { code: "permission", message: "Instagram didn't allow this. Reconnect Instagram and accept every permission it asks for.", httpStatus: 403 };
  }
  return { code: "unknown", message: "Couldn't reach Instagram right now. Try again in a minute.", httpStatus: 502 };
}
