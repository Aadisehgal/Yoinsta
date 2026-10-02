// Drawing code for the Thumbnail Maker. It works on any CanvasRenderingContext2D, so the screen, the
// exported file and the tests all get exactly the same pixels. No React / network in here.

export type Format = "landscape" | "portrait";

export const FORMATS: Record<Format, { w: number; h: number }> = {
  landscape: { w: 1280, h: 720 }, // YouTube's recommended thumbnail size
  portrait: { w: 720, h: 1280 }, // Instagram / Shorts-style cover
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextLayer {
  text: string;
  color: string;
  stroke: string;
  /** Font size as a percentage of the canvas height. */
  size: number;
  /** Centre of the text block as a fraction (0..1) of the canvas width / height. */
  x: number;
  y: number;
}

export type Background =
  | { kind: "image"; source: CanvasImageSource; width: number; height: number; crop?: Box }
  | { kind: "gradient"; from: string; to: string };

export interface ThumbnailDesign {
  format: Format;
  background: Background;
  layers: TextLayer[];
  /** 0..100 — adds contrast and colour to the picture. */
  punch: number;
  /** Darkens the top and bottom so text stays readable. */
  shade: boolean;
}

export const FONT_STACK = '"Arial Black", "Roboto Black", "sans-serif-black", Impact, system-ui, sans-serif';

export const TEXT_COLORS = ["#FFFFFF", "#FFD400", "#FF3B30", "#34C759", "#00E5FF", "#FF2DAA", "#FF9500", "#000000"];
export const STROKE_COLORS = ["#000000", "#FFFFFF", "#FF3B30", "#0A1A44"];

export const GRADIENTS: { from: string; to: string }[] = [
  { from: "#1B1F3B", to: "#6A11CB" },
  { from: "#FF512F", to: "#F09819" },
  { from: "#0F2027", to: "#2C5364" },
  { from: "#ED213A", to: "#93291E" },
  { from: "#11998E", to: "#38EF7D" },
  { from: "#232526", to: "#414345" },
];

/** Pulls the 11-character video ID out of a YouTube link (or accepts the bare ID). */
export function parseVideoId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  const m = /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})(?![\w-])/.exec(text);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- black-bar detection

/**
 * YouTube serves a vertical Short's picture inside a 16:9 frame with black bars on the sides. Find the
 * real picture so it can fill the thumbnail. Bars only count when they are big and roughly equal on both
 * sides — a genuinely dark photo is left alone.
 */
export function detectContentBox(img: { data: Uint8ClampedArray; width: number; height: number }): Box {
  const { data, width: w, height: h } = img;
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const colBrightness = (x: number) => {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y += 2) {
      sum += lum((y * w + x) * 4);
      n++;
    }
    return sum / n;
  };
  const rowBrightness = (y: number) => {
    let sum = 0;
    let n = 0;
    for (let x = 0; x < w; x += 2) {
      sum += lum((y * w + x) * 4);
      n++;
    }
    return sum / n;
  };

  const DARK = 14;
  let left = 0;
  while (left < w && colBrightness(left) < DARK) left++;
  let right = w - 1;
  while (right > left && colBrightness(right) < DARK) right--;
  let top = 0;
  while (top < h && rowBrightness(top) < DARK) top++;
  let bottom = h - 1;
  while (bottom > top && rowBrightness(bottom) < DARK) bottom--;

  const real = (a: number, b: number, size: number) => a >= size * 0.06 && b >= size * 0.06 && Math.abs(a - b) <= size * 0.04;
  const cropX = real(left, w - 1 - right, w);
  const cropY = real(top, h - 1 - bottom, h);

  // Step 2 pixels inside the detected edge: the bar's border is soft (compression, the downscaled probe),
  // and a thin black line along the finished thumbnail would look like a mistake.
  const INSET = 2;
  const x0 = cropX ? left + INSET : 0;
  const x1 = cropX ? right - INSET : w - 1;
  const y0 = cropY ? top + INSET : 0;
  const y1 = cropY ? bottom - INSET : h - 1;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------------------------------------------------------------- text layout

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface TextLayout {
  lines: string[];
  px: number;
  lineHeight: number;
  box: Box;
}

/** Works out the font size, line breaks and bounding box for a layer (used for drawing and for touch hit-testing). */
export function layoutText(ctx: CanvasRenderingContext2D, layer: TextLayer, W: number, H: number): TextLayout | null {
  const text = layer.text.replace(/\r/g, "").trim();
  if (!text) return null;

  const maxWidth = W * 0.9;
  let px = Math.max(12, Math.round((layer.size / 100) * H));
  let lines: string[] = [];
  let widest = 0;
  for (let guard = 0; guard < 40; guard++) {
    ctx.font = `900 ${px}px ${FONT_STACK}`;
    lines = wrapLines(ctx, text, maxWidth);
    widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth || px <= 12) break;
    px = Math.max(12, Math.round(px * 0.92)); // one very long word: shrink until it fits
  }

  const lineHeight = px * 1.08;
  const blockH = lines.length * lineHeight;
  return {
    lines,
    px,
    lineHeight,
    box: { x: layer.x * W - widest / 2, y: layer.y * H - blockH / 2, w: widest, h: blockH },
  };
}

/** Index of the top-most text layer under the point (canvas pixels), or -1. */
export function hitLayer(ctx: CanvasRenderingContext2D, design: ThumbnailDesign, x: number, y: number): number {
  const { w, h } = FORMATS[design.format];
  const pad = Math.round(h * 0.03);
  for (let i = design.layers.length - 1; i >= 0; i--) {
    const layout = layoutText(ctx, design.layers[i], w, h);
    if (!layout) continue;
    const b = layout.box;
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return i;
  }
  return -1;
}

// ---------------------------------------------------------------- drawing

export function punchFilter(punch: number): string {
  const p = Math.max(0, Math.min(100, punch));
  if (p === 0) return "none";
  return `contrast(${(1 + p * 0.004).toFixed(3)}) saturate(${(1 + p * 0.01).toFixed(3)})`;
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, W: number, H: number, punch: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  if (bg.kind === "gradient") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const src = bg.crop ?? { x: 0, y: 0, w: bg.width, h: bg.height };
  if (src.w <= 0 || src.h <= 0) return;
  const scale = Math.max(W / src.w, H / src.h); // "cover": fill the frame, crop the overflow
  const dw = src.w * scale;
  const dh = src.h * scale;
  ctx.filter = punchFilter(punch);
  ctx.drawImage(bg.source, src.x, src.y, src.w, src.h, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.filter = "none";
}

function drawShade(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const bottom = ctx.createLinearGradient(0, H * 0.5, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  const top = ctx.createLinearGradient(0, 0, 0, H * 0.35);
  top.addColorStop(0, "rgba(0,0,0,0.5)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.35);
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, W: number, H: number) {
  const layout = layoutText(ctx, layer, W, H);
  if (!layout) return;

  ctx.font = `900 ${layout.px}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  layout.lines.forEach((line, i) => {
    const x = layer.x * W;
    const y = layout.box.y + layout.lineHeight * (i + 0.5);

    ctx.save();
    ctx.lineWidth = layout.px * 0.18;
    ctx.strokeStyle = layer.stroke;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = layout.px * 0.18;
    ctx.shadowOffsetY = layout.px * 0.06;
    ctx.strokeText(line, x, y);
    ctx.restore();

    ctx.fillStyle = layer.color;
    ctx.fillText(line, x, y);
  });
}

export function drawThumbnail(ctx: CanvasRenderingContext2D, design: ThumbnailDesign) {
  const { w, h } = FORMATS[design.format];
  ctx.save();
  drawBackground(ctx, design.background, w, h, design.punch);
  if (design.shade) drawShade(ctx, w, h);
  for (const layer of design.layers) drawLayer(ctx, layer, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- exporting

const QUALITIES = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4];

/** JPEG under the size limit (YouTube allows 2 MB): lowers quality step by step until it fits. */
export async function exportJpeg(
  canvas: HTMLCanvasElement,
  maxBytes: number
): Promise<{ blob: Blob; dataUrl: string; quality: number } | null> {
  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) {
      return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality), quality };
    }
  }
  return null;
}
