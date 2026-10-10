// How the Instagram access token is stored: one encrypted string holding the token plus when it was issued
// and when it expires (long-lived tokens last 60 days and can be refreshed once they are a day old).
// Pure helpers — encryption itself happens in the caller.

const DAY = 86_400;

export interface StoredToken {
  token: string;
  /** Unix seconds when we got / last refreshed it. */
  issuedAt: number;
  /** Unix seconds when it stops working. */
  expiresAt: number;
}

export function packToken(t: StoredToken): string {
  return JSON.stringify({ t: t.token, at: t.issuedAt, exp: t.expiresAt });
}

export function unpackToken(plain: string, nowSeconds: number): StoredToken | null {
  try {
    const o = JSON.parse(plain) as { t?: unknown; at?: unknown; exp?: unknown };
    if (typeof o.t === "string" && o.t) {
      const issuedAt = typeof o.at === "number" ? o.at : nowSeconds;
      const expiresAt = typeof o.exp === "number" ? o.exp : issuedAt + 60 * DAY;
      return { token: o.t, issuedAt, expiresAt };
    }
  } catch {
    // not JSON — fall through
  }
  // a bare token string (nothing else known about it)
  return plain && !plain.startsWith("{") ? { token: plain, issuedAt: nowSeconds, expiresAt: nowSeconds + 30 * DAY } : null;
}

/** Refresh once it is at least a day old and within 15 days of expiring. Expired tokens can't be refreshed. */
export function needsRefresh(t: StoredToken, nowSeconds: number): boolean {
  if (t.expiresAt <= nowSeconds) return false;
  return nowSeconds - t.issuedAt >= DAY && t.expiresAt - nowSeconds <= 15 * DAY;
}

export function isExpired(t: StoredToken, nowSeconds: number): boolean {
  return t.expiresAt <= nowSeconds;
}
