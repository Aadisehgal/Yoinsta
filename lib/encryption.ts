import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return buf;
}

/**
 * Encrypts a plaintext string (API key, OAuth refresh token, etc.).
 * Output format: base64(iv):base64(authTag):base64(ciphertext)
 * Never log the input or the output of this function.
 */
export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

/** Decrypts a value produced by encrypt(). Throws if the payload was tampered with. */
export function decrypt(payload: string): string {
  const [ivB64, authTagB64, dataB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Malformed encrypted payload.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plainText = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);

  return plainText.toString("utf8");
}

/** Masks a secret for display, e.g. "AAD••••••M2". Never send the real value to the client. */
export function maskSecret(value: string, visibleStart = 3, visibleEnd = 2): string {
  if (value.length <= visibleStart + visibleEnd) return "•".repeat(value.length);
  return value.slice(0, visibleStart) + "••••••" + value.slice(-visibleEnd);
}

/** SHA-256 hash for the Master Access Code — one-way, matches spec section 5. */
export function sha256Hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
