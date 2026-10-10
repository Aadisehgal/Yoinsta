// Meta calls our "deauthorize" and "data deletion" URLs with a `signed_request`:
//   base64url(signature) + "." + base64url(JSON payload)
// where the signature is HMAC-SHA256 of the payload part, keyed with the app secret. Pure helpers.

import crypto from "crypto";

export interface SignedPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [k: string]: unknown;
}

const b64urlToBuffer = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Returns the payload only if the signature is valid for this app secret; null otherwise. */
export function parseSignedRequest(signedRequest: string, appSecret: string): SignedPayload | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [sig, payload] = parts;

  const expected = crypto.createHmac("sha256", appSecret).update(payload).digest();
  const given = b64urlToBuffer(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  try {
    const data = JSON.parse(b64urlToBuffer(payload).toString("utf8")) as SignedPayload;
    if (data.algorithm && String(data.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return data;
  } catch {
    return null;
  }
}

/** For tests and local checks: builds a correctly signed request. */
export function signRequest(payload: SignedPayload, appSecret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", appSecret).update(body).digest("base64url");
  return `${sig}.${body}`;
}
