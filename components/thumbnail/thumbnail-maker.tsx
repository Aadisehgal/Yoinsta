"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import { THUMBNAIL_MAX_BYTES } from "@/lib/video-edit";
import {
  FORMATS,
  GRADIENTS,
  STROKE_COLORS,
  TEXT_COLORS,
  detectContentBox,
  drawThumbnail,
  exportJpeg,
  hitLayer,
  parseVideoId,
  type Background,
  type Box,
  type Format,
  type TextLayer,
  type ThumbnailDesign,
} from "@/lib/thumbnail-canvas";

const inputClass = "w-full rounded-md border border-border bg-ink-950 px-3 py-2 text-sm";

const DEFAULT_LAYERS: TextLayer[] = [
  { text: "WAIT FOR THE END", color: "#FFD400", stroke: "#000000", size: 15, x: 0.5, y: 0.8 },
  { text: "", color: "#FFFFFF", stroke: "#000000", size: 7, x: 0.5, y: 0.93 },
];

const LAYER_NAMES = ["Headline", "Small text"];

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          onClick={() => onPick(c)}
          style={{ backgroundColor: c }}
          className={cn(
            "h-8 w-8 rounded-full border-2",
            value.toLowerCase() === c.toLowerCase() ? "border-saffron-400" : "border-border"
          )}
        />
      ))}
    </div>
  );
}

/** Looks at a small copy of the picture and returns the area without black bars (full area for normal photos). */
function findPictureArea(el: HTMLImageElement): Box | undefined {
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(el.naturalWidth, el.naturalHeight));
  const w = Math.max(1, Math.round(el.naturalWidth * scale));
  const h = Math.max(1, Math.round(el.naturalHeight * scale));
  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const ctx = probe.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(el, 0, 0, w, h);
  const box = detectContentBox(ctx.getImageData(0, 0, w, h));
  if (box.w === w && box.h === h) return undefined;
  return {
    x: Math.round(box.x / scale),
    y: Math.round(box.y / scale),
    w: Math.round(box.w / scale),
    h: Math.round(box.h / scale),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image failed to load"));
    el.src = src;
  });
}

export function ThumbnailMaker({ initialVideo }: { initialVideo?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const [format, setFormat] = useState<Format>("landscape");
  const [image, setImage] = useState<{ el: HTMLImageElement; crop?: Box } | null>(null);
  const [gradientIdx, setGradientIdx] = useState(0);
  const [layers, setLayers] = useState<TextLayer[]>(DEFAULT_LAYERS);
  const [active, setActive] = useState(0);
  const [punch, setPunch] = useState(25);
  const [shade, setShade] = useState(true);
  const [moveMode, setMoveMode] = useState(false);

  const [videoInput, setVideoInput] = useState(initialVideo ?? "");
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  function currentDesign(): ThumbnailDesign {
    const background: Background = image
      ? { kind: "image", source: image.el, width: image.el.naturalWidth, height: image.el.naturalHeight, crop: image.crop }
      : { kind: "gradient", ...GRADIENTS[gradientIdx] };
    return { format, background, layers, punch, shade };
  }

  // Redraw whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = FORMATS[format];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const background: Background = image
      ? { kind: "image", source: image.el, width: image.el.naturalWidth, height: image.el.naturalHeight, crop: image.crop }
      : { kind: "gradient", ...GRADIENTS[gradientIdx] };
    drawThumbnail(ctx, { format, background, layers, punch, shade });
  }, [format, image, gradientIdx, layers, punch, shade]);

  // Opened from a video's editor (?video=ID): fetch that video's picture right away.
  useEffect(() => {
    if (initialVideo) void loadFrame(initialVideo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFrame(input: string) {
    const id = parseVideoId(input);
    if (!id) {
      setNotice({ kind: "error", text: "Paste a YouTube video link first." });
      return;
    }
    setLoadingFrame(true);
    setNotice(null);
    try {
      const el = await loadImage(`/api/thumbnail/frame?id=${id}`);
      setImage({ el, crop: findPictureArea(el) });
      setVideoInput(id);
    } catch {
      setNotice({ kind: "error", text: "Couldn't load that video's picture. Check the link, or upload an image instead." });
    } finally {
      setLoadingFrame(false);
    }
  }

  async function loadFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice({ kind: "error", text: "Choose an image file." });
      return;
    }
    setNotice(null);
    const url = URL.createObjectURL(file);
    try {
      const el = await loadImage(url);
      setImage({ el }); // a photo from the gallery is used as it is — no bar detection
    } catch {
      setNotice({ kind: "error", text: "Couldn't open that image." });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function updateLayer(index: number, patch: Partial<TextLayer>) {
    setLayers((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  // ---- dragging text on the picture (only while "Move text" is on, so the page can still scroll)
  function toCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!moveMode) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = toCanvas(e);
    const index = hitLayer(ctx, currentDesign(), p.x, p.y);
    if (index < 0) return;
    const { w, h } = FORMATS[format];
    setActive(index);
    dragRef.current = { index, dx: layers[index].x * w - p.x, dy: layers[index].y * h - p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const { w, h } = FORMATS[format];
    const p = toCanvas(e);
    const clamp = (v: number) => Math.min(0.95, Math.max(0.05, v));
    updateLayer(drag.index, { x: clamp((p.x + drag.dx) / w), y: clamp((p.y + drag.dy) / h) });
  }

  function endDrag() {
    dragRef.current = null;
  }

  // ---- exporting
  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy("download");
    setNotice(null);
    try {
      const out = await exportJpeg(canvas, THUMBNAIL_MAX_BYTES);
      if (!out) {
        setNotice({ kind: "error", text: "Couldn't make the image small enough. Try a simpler picture." });
        return;
      }
      const a = document.createElement("a");
      a.href = out.dataUrl;
      a.download = `thumbnail-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setNotice({ kind: "ok", text: "Saved to your Downloads." });
    } finally {
      setBusy(null);
    }
  }

  async function uploadToYouTube() {
    const canvas = canvasRef.current;
    const id = parseVideoId(videoInput);
    if (!canvas) return;
    if (!id) {
      setNotice({ kind: "error", text: "Paste your YouTube video link above first." });
      return;
    }
    setBusy("upload");
    setNotice(null);
    try {
      const out = await exportJpeg(canvas, THUMBNAIL_MAX_BYTES);
      if (!out) {
        setNotice({ kind: "error", text: "Couldn't make the image small enough. Try a simpler picture." });
        return;
      }
      const form = new FormData();
      form.append("file", new File([out.blob], "thumbnail.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/youtube/manage/videos/${id}/thumbnail`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", text: data.error ?? "Upload failed.", code: data.code });
        return;
      }
      setNotice({ kind: "ok", text: "Thumbnail uploaded to YouTube. It can take a minute to show everywhere." });
    } catch {
      setNotice({ kind: "error", text: "Network problem — try again." });
    } finally {
      setBusy(null);
    }
  }

  const layer = layers[active];

  return (
    <div className="max-w-2xl space-y-6 pb-8">
      <div>
        <Link href="/dashboard/thumbnails" className="text-sm text-muted underline underline-offset-4">
          ← Thumbnails
        </Link>
        <h1 className="mt-3 font-display text-2xl font-medium">Thumbnail Maker</h1>
        <p className="mt-1 text-sm text-muted">
          Free and instant — no AI credits. Pick a picture, add big text, then save it or send it straight to YouTube.
        </p>
      </div>

      <Card className="space-y-3">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ touchAction: moveMode ? "none" : "auto" }}
          className={cn(
            "mx-auto block h-auto rounded-md border border-border bg-ink-950",
            format === "landscape" ? "w-full" : "w-full max-w-[280px]",
            moveMode && "cursor-move ring-2 ring-saffron-500"
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {(["landscape", "portrait"] as Format[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs",
                  format === f ? "border-saffron-500 bg-ink-800" : "border-border hover:bg-ink-800"
                )}
              >
                {f === "landscape" ? "Wide 16:9" : "Vertical 9:16"}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" variant={moveMode ? "primary" : "secondary"} onClick={() => setMoveMode((m) => !m)}>
            {moveMode ? "Move text: ON" : "Move text: off"}
          </Button>
        </div>
        {moveMode && <p className="text-xs text-muted">Drag the text on the picture. Turn this off to scroll the page.</p>}
        {format === "portrait" && (
          <p className="text-xs text-muted">Vertical is for Instagram or Shorts covers. YouTube thumbnails should be wide (16:9).</p>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <CardTitle>1. Picture</CardTitle>
          <CardDescription>Use a frame from your video, a photo from your phone, or just a colour.</CardDescription>
        </div>

        <div className="flex gap-2">
          <input
            value={videoInput}
            onChange={(e) => setVideoInput(e.target.value)}
            placeholder="Paste your YouTube video link"
            className={inputClass}
            aria-label="YouTube video link"
          />
          <Button type="button" variant="secondary" onClick={() => loadFrame(videoInput)} disabled={loadingFrame || !videoInput.trim()}>
            {loadingFrame ? "Loading…" : "Use video"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-border bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700">
            Choose from phone
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void loadFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {image && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setImage(null)}>
              Remove picture
            </Button>
          )}
        </div>

        {!image && (
          <div>
            <p className="mb-2 text-xs text-muted">Background colour</p>
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Background colour ${i + 1}`}
                  onClick={() => setGradientIdx(i)}
                  style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                  className={cn("h-9 w-14 rounded-md border-2", gradientIdx === i ? "border-saffron-400" : "border-border")}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="flex justify-between text-xs text-muted" htmlFor="punch">
              <span>Make colours pop</span>
              <span>{punch}</span>
            </label>
            <input
              id="punch"
              type="range"
              min={0}
              max={100}
              value={punch}
              onChange={(e) => setPunch(Number(e.target.value))}
              className="w-full"
              disabled={!image}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shade} onChange={(e) => setShade(e.target.checked)} />
            Darken top and bottom so text is easy to read
          </label>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <CardTitle>2. Text</CardTitle>
          <CardDescription>Short and big works best: 2–4 words.</CardDescription>
        </div>

        <div className="flex gap-2">
          {layers.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                active === i ? "border-saffron-500 bg-ink-800" : "border-border hover:bg-ink-800"
              )}
            >
              {LAYER_NAMES[i]}
            </button>
          ))}
        </div>

        <textarea
          value={layer.text}
          onChange={(e) => updateLayer(active, { text: e.target.value })}
          rows={2}
          placeholder={active === 0 ? "e.g. WAIT FOR THE END" : "Optional small line"}
          className={inputClass}
          aria-label={`${LAYER_NAMES[active]} text`}
        />

        <div>
          <label className="flex justify-between text-xs text-muted" htmlFor="size">
            <span>Size</span>
            <span>{layer.size}</span>
          </label>
          <input
            id="size"
            type="range"
            min={4}
            max={36}
            value={layer.size}
            onChange={(e) => updateLayer(active, { size: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted">Text colour</p>
          <Swatches colors={TEXT_COLORS} value={layer.color} onPick={(c) => updateLayer(active, { color: c })} label="Text colour" />
          <p className="pt-1 text-xs text-muted">Outline colour</p>
          <Swatches colors={STROKE_COLORS} value={layer.stroke} onPick={(c) => updateLayer(active, { stroke: c })} label="Outline colour" />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Top", y: 0.15 },
              { label: "Middle", y: 0.5 },
              { label: "Bottom", y: 0.85 },
            ].map((p) => (
              <Button key={p.label} type="button" size="sm" variant="secondary" onClick={() => updateLayer(active, { y: p.y, x: 0.5 })}>
                {p.label}
              </Button>
            ))}
          </div>
          <div>
            <label className="flex justify-between text-xs text-muted" htmlFor="pos-x">
              <span>Left ↔ Right</span>
            </label>
            <input
              id="pos-x"
              type="range"
              min={5}
              max={95}
              value={Math.round(layer.x * 100)}
              onChange={(e) => updateLayer(active, { x: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </div>
          <div>
            <label className="flex justify-between text-xs text-muted" htmlFor="pos-y">
              <span>Up ↕ Down</span>
            </label>
            <input
              id="pos-y"
              type="range"
              min={5}
              max={95}
              value={Math.round(layer.y * 100)}
              onChange={(e) => updateLayer(active, { y: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <CardTitle>3. Save</CardTitle>
          <CardDescription>
            Download the image, or send it straight to your video (needs the video link above and a verified channel).
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={download} disabled={busy !== null}>
            {busy === "download" ? "Preparing…" : "Download image"}
          </Button>
          <Button type="button" variant="secondary" onClick={uploadToYouTube} disabled={busy !== null}>
            {busy === "upload" ? "Uploading…" : "Set as my video's thumbnail"}
          </Button>
        </div>
        {notice && <NoticeBox notice={notice} />}
      </Card>
    </div>
  );
}
