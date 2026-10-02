// How access codes are written and recognised. Pure on purpose (no database / crypto), so the
// rules can be tested on their own. Codes look like YOIN-XXXX-XXXX using letters and the digits 2-9
// (no I, O, 0 or 1 — they get typed by hand and those are easy to mix up).

export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_SHAPE = /^YOIN-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** Forgiving about how it was typed: any case, spaces, dashes, dots, or the YOIN- prefix left off. */
export function normalizeAccessCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = cleaned.startsWith("YOIN") ? cleaned.slice(4) : cleaned;
  if (body.length === 8) return `YOIN-${body.slice(0, 4)}-${body.slice(4)}`;
  return raw.trim().toUpperCase();
}

/** null when the text looks like a real code; otherwise a message that says what is wrong. */
export function describeBadCodeShape(raw: string): string | null {
  if (CODE_SHAPE.test(normalizeAccessCode(raw))) return null;
  if (/^\d{4,8}$/.test(raw.trim())) {
    return "That looks like a PIN, not an access code. Access codes look like YOIN-XXXX-XXXX and are made in the admin panel.";
  }
  return "That doesn't look like a Yoinsta access code. Codes look like YOIN-XXXX-XXXX (letters, and numbers 2 to 9).";
}
