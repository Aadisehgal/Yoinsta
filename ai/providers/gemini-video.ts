// Asks Gemini to WATCH a public YouTube video (the API accepts a YouTube URL as file data).
// Same safety net as the text provider: one retry on overload, then the next model; only status
// codes and model names are ever reported back — never the key or Google's raw error text.

const MODELS = (process.env.GEMINI_VIDEO_MODEL ?? "gemini-flash-latest,gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OVERLOADED = new Set([500, 502, 503, 504]);
const RETRY_PAUSE_MS = 800;
const DEADLINE_MS = 52_000; // leaves room inside Vercel's 60 s function limit

export type VideoReviewError = Error & { status?: number; detail?: string };

export interface VideoReviewRequest {
  videoId: string;
  systemPrompt: string;
  prompt: string;
  /** Only send the first N seconds (long videos). */
  endOffsetSeconds?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestOnce(apiKey: string, model: string, req: VideoReviewRequest, timeoutMs: number): Promise<string> {
  const videoPart: Record<string, unknown> = {
    fileData: { fileUri: `https://www.youtube.com/watch?v=${req.videoId}`, mimeType: "video/*" },
  };
  if (req.endOffsetSeconds) videoPart.videoMetadata = { startOffset: "0s", endOffset: `${req.endOffsetSeconds}s` };

  let res: Response;
  try {
    res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.systemPrompt }] },
        contents: [{ role: "user", parts: [videoPart, { text: req.prompt }] }],
      }),
    });
  } catch {
    throw new Error("TIMEOUT");
  }

  if (!res.ok) {
    const err = new Error(`Gemini video request failed: ${res.status}`) as VideoReviewError;
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}

export async function reviewYouTubeVideo(apiKey: string, req: VideoReviewRequest): Promise<{ text: string; model: string }> {
  const started = Date.now();
  const trail: string[] = [];
  let lastErr: VideoReviewError | undefined;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = DEADLINE_MS - (Date.now() - started);
      if (remaining < 3000) {
        const out = new Error("TIMEOUT") as VideoReviewError;
        out.detail = trail.join(" → ");
        throw out;
      }
      try {
        return { text: await requestOnce(apiKey, model, req, remaining), model };
      } catch (err) {
        lastErr = err as VideoReviewError;
        const status = lastErr.status;

        if (status === 404 || status === 429) {
          trail.push(`${model} ${status}`);
          break; // another model has its own availability / quota
        }
        if (status !== undefined && OVERLOADED.has(status)) {
          if (attempt === 0) await sleep(RETRY_PAUSE_MS);
          else trail.push(`${model} ${status}`);
          continue;
        }
        // 400 (video can't be opened), 401/403 (key), timeout, empty answer: another model won't help.
        trail.push(`${model} ${status ?? lastErr.message}`);
        lastErr.detail = trail.join(" → ");
        throw lastErr;
      }
    }
  }

  const finalErr = (lastErr ?? new Error("Gemini video request failed")) as VideoReviewError;
  finalErr.detail = trail.join(" → ");
  throw finalErr;
}

/** A message the creator can act on, built only from the status code / marker. */
export function describeVideoFailure(err: unknown): { message: string; httpStatus: number } {
  const e = err as VideoReviewError | undefined;
  const trail = e?.detail ? ` [${e.detail}]` : "";
  if (e?.message === "TIMEOUT") {
    return { message: "Gemini took too long to watch this video. Try again, or try a shorter video.", httpStatus: 504 };
  }
  if (e?.message === "EMPTY_RESPONSE") {
    return { message: "Gemini sent back an empty answer. Try again.", httpStatus: 502 };
  }
  switch (e?.status) {
    case 400:
      return {
        message: `Gemini couldn't open this video. It must be Public (not unlisted or private) and not age-restricted.${trail}`,
        httpStatus: 400,
      };
    case 401:
    case 403:
      return { message: `Gemini rejected your API key. Re-check it in Settings.${trail}`, httpStatus: 400 };
    case 404:
      return { message: `Gemini couldn't find the video model this app asked for.${trail}`, httpStatus: 502 };
    case 429:
      return {
        message: `Gemini's free limit for video is used up for now (free keys get about 8 hours of YouTube video per day, plus a per-minute limit). Try again later.${trail}`,
        httpStatus: 429,
      };
    default:
      return { message: `Gemini is busy or down on its side. Try again in a minute.${trail}`, httpStatus: 502 };
  }
}
