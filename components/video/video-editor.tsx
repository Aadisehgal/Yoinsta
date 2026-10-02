"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalysisPanel } from "@/components/video/analysis-panel";
import { SceneReviewPanel } from "@/components/video/scene-review-panel";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import {
  DESCRIPTION_MAX_BYTES,
  TAGS_MAX_CHARS,
  THUMBNAIL_MAX_BYTES,
  TITLE_MAX,
  cleanTags,
  tagsLength,
  type EditableVideo,
  type VisibilityMode,
} from "@/lib/video-edit";

const inputClass = "w-full rounded-md border border-border bg-ink-950 px-3 py-2 text-sm";

const pad = (n: number) => String(n).padStart(2, "0");
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** ISO time -> the "YYYY-MM-DDTHH:mm" text a datetime-local input wants (in the phone's timezone). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function modeOf(v: EditableVideo): VisibilityMode {
  return v.privacyStatus === "private" && v.publishAt ? "schedule" : v.privacyStatus;
}

const VISIBILITY_OPTIONS: { value: VisibilityMode; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Everyone can watch" },
  { value: "unlisted", label: "Unlisted", hint: "Only people with the link" },
  { value: "private", label: "Private", hint: "Only you" },
  { value: "schedule", label: "Schedule", hint: "Goes public at a set time" },
];

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  function commit(raw: string) {
    const next = cleanTags([...tags, raw]);
    if (next.length === tags.length) {
      setPending("");
      return;
    }
    if (tagsLength(next) > TAGS_MAX_CHARS) {
      setError(`That would pass YouTube's ${TAGS_MAX_CHARS}-character tag limit.`);
      return;
    }
    setError("");
    setPending("");
    onChange(next);
  }

  const used = tagsLength(tags);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1 pl-3 pr-1 text-xs">
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="rounded-full px-1.5 text-muted hover:bg-ink-700 hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) commit(v);
          else setPending(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (pending.trim()) commit(pending);
          } else if (e.key === "Backspace" && !pending && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (pending.trim()) commit(pending);
        }}
        placeholder="Type a tag and press Enter"
        className={cn(inputClass, "mt-2")}
      />
      <div className="mt-1 flex justify-between text-xs">
        <span className="text-red-400">{error}</span>
        <span className={used > TAGS_MAX_CHARS ? "text-red-400" : "text-muted"}>
          {used}/{TAGS_MAX_CHARS} characters
        </span>
      </div>
    </div>
  );
}

function ThumbnailCard({ video }: { video: EditableVideo }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [shown, setShown] = useState(video.thumbnail);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(f: File | null) {
    setNotice(null);
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/gif"].includes(f.type)) {
      setNotice({ kind: "error", text: "Use a JPG, PNG or GIF image." });
      return;
    }
    if (f.size > THUMBNAIL_MAX_BYTES) {
      setNotice({ kind: "error", text: "Thumbnail must be 2 MB or smaller." });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/youtube/manage/videos/${video.id}/thumbnail`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: "error", text: data.error ?? "Upload failed.", code: data.code });
        return;
      }
      if (preview) setShown(preview);
      setFile(null);
      setNotice({ kind: "ok", text: "Thumbnail updated. YouTube can take a minute to show it everywhere." });
    } catch {
      setNotice({ kind: "error", text: "Network problem — try again." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Thumbnail</CardTitle>
        <CardDescription>1280×720 works best. JPG, PNG or GIF, up to 2 MB. Needs a verified channel.</CardDescription>
        <Link
          href={`/dashboard/thumbnails/maker?video=${video.id}`}
          className="mt-2 inline-block text-sm text-saffron-400 underline underline-offset-4"
        >
          Make one in the free Thumbnail Maker →
        </Link>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview ?? shown}
        alt="Video thumbnail"
        className="aspect-video w-full max-w-md rounded-md border border-border bg-ink-950 object-cover"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-border bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700">
          Choose image
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="button" onClick={upload} disabled={!file || uploading}>
          {uploading ? "Uploading…" : "Set as thumbnail"}
        </Button>
      </div>

      {notice && <NoticeBox notice={notice} />}
    </Card>
  );
}

export function VideoEditor({ videoId }: { videoId: string }) {
  const [video, setVideo] = useState<EditableVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Notice | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<VisibilityMode>("public");
  const [publishLocal, setPublishLocal] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<Notice | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const applyVideo = useCallback((v: EditableVideo) => {
    setVideo(v);
    setTitle(v.title);
    setDescription(v.description);
    setTags(v.tags);
    setMode(modeOf(v));
    setPublishLocal(toLocalInput(v.publishAt));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/youtube/manage/videos/${videoId}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError({ kind: "error", text: data.error ?? "Couldn't load this video.", code: data.code });
        } else {
          applyVideo(data.video as EditableVideo);
        }
      } catch {
        if (!cancelled) setLoadError({ kind: "error", text: "Network problem — check your connection." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId, applyVideo]);

  if (loading) return <p className="text-sm text-muted">Loading video…</p>;
  if (loadError || !video) {
    return (
      <div className="space-y-4">
        <NoticeBox notice={loadError ?? { kind: "error", text: "Couldn't load this video." }} />
        <Link href="/dashboard/videos" className="text-sm text-muted underline underline-offset-4">
          Back to all videos
        </Link>
      </div>
    );
  }

  const current = video;
  const scheduleIso = publishLocal ? new Date(publishLocal).toISOString() : "";

  /** Only the fields that actually differ from what's saved on YouTube. */
  function buildChanges(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    if (title.trim() !== current.title) changes.title = title;
    if (description.trim() !== current.description.trim()) changes.description = description;
    if (JSON.stringify(cleanTags(tags)) !== JSON.stringify(current.tags)) changes.tags = tags;

    const savedMode = modeOf(current);
    const scheduleMoved =
      mode === "schedule" &&
      (!current.publishAt || !scheduleIso || new Date(current.publishAt).getTime() !== new Date(scheduleIso).getTime());
    if (mode !== savedMode || scheduleMoved) {
      changes.visibility = mode === "schedule" ? { mode, publishAt: scheduleIso } : { mode };
    }
    return changes;
  }

  const changes = buildChanges();
  const dirty = Object.keys(changes).length > 0;
  const makingPublic = mode === "public" && current.privacyStatus !== "public";

  async function save(skipConfirm = false) {
    if (!dirty) return;
    if (makingPublic && !skipConfirm) {
      setConfirmPublish(true);
      return;
    }
    setConfirmPublish(false);
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await fetch(`/api/youtube/manage/videos/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveNotice({ kind: "error", text: data.error ?? "Couldn't save.", code: data.code });
        return;
      }
      applyVideo(data.video as EditableVideo);
      setSaveNotice({ kind: "ok", text: "Saved to YouTube." });
    } catch {
      setSaveNotice({ kind: "error", text: "Network problem — try again." });
    } finally {
      setSaving(false);
    }
  }

  const descBytes = utf8Length(description);
  const titleLen = Array.from(title).length;
  const minLocal = toLocalInput(new Date(Date.now() + 10 * 60 * 1000).toISOString());
  const canSchedule = current.privacyStatus === "private";

  return (
    <div className="max-w-2xl space-y-6 pb-24">
      <div>
        <Link href="/dashboard/videos" className="text-sm text-muted underline underline-offset-4">
          ← All videos
        </Link>
        <h1 className="mt-3 font-display text-2xl font-medium">Edit video</h1>
        <p className="mt-1 text-sm text-muted">
          Changes go to YouTube when you press Save. Editing needs the &ldquo;manage videos&rdquo; permission —{" "}
          <a href="/api/youtube/connect" className="underline underline-offset-4">
            reconnect YouTube
          </a>{" "}
          once if saving says permission is missing.
        </p>
      </div>

      <Card className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="video-title">
            Title
          </label>
          <input
            id="video-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <p className={cn("mt-1 text-right text-xs", titleLen > TITLE_MAX ? "text-red-400" : "text-muted")}>
            {titleLen}/{TITLE_MAX}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="video-description">
            Description
          </label>
          <textarea
            id="video-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={9}
            className={inputClass}
          />
          <p
            className={cn(
              "mt-1 text-right text-xs",
              descBytes > DESCRIPTION_MAX_BYTES ? "text-red-400" : "text-muted"
            )}
          >
            {descBytes}/{DESCRIPTION_MAX_BYTES}
          </p>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Tags</p>
          <TagsInput tags={tags} onChange={setTags} />
        </div>
      </Card>

      <AnalysisPanel
        videoId={current.id}
        draft={{ title, description, tags }}
        onUseTitle={setTitle}
        onUseDescription={setDescription}
        onRemoveTags={(list) => {
          const drop = new Set(list.map((t) => t.toLowerCase()));
          const next = tags.filter((t) => !drop.has(t.toLowerCase()));
          setTags(next);
          return tags.length - next.length;
        }}
        onAddTags={(list) => {
          // One at a time, so we stop before passing YouTube's 500-character limit — and say so.
          let next = tags;
          let added = 0;
          let skipped = 0;
          for (const tag of list) {
            const candidate = cleanTags([...next, tag]);
            if (candidate.length === next.length) continue; // already there
            if (tagsLength(candidate) <= TAGS_MAX_CHARS) {
              next = candidate;
              added += 1;
            } else {
              skipped += 1;
            }
          }
          setTags(next);
          return { added, skipped };
        }}
      />

      <SceneReviewPanel videoId={current.id} isPublic={current.privacyStatus === "public"} privacy={current.privacyStatus} />

      <Card className="space-y-4">
        <div>
          <CardTitle>Visibility</CardTitle>
          <CardDescription>
            Currently{" "}
            {modeOf(current) === "schedule" && current.publishAt
              ? `scheduled for ${new Date(current.publishAt).toLocaleString()}`
              : current.privacyStatus}
            .
          </CardDescription>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {VISIBILITY_OPTIONS.map((opt) => {
            const disabled = opt.value === "schedule" && !canSchedule;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setMode(opt.value)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  mode === opt.value
                    ? "border-saffron-500 bg-ink-800"
                    : "border-border hover:bg-ink-800"
                )}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs text-muted">{opt.hint}</span>
              </button>
            );
          })}
        </div>

        {!canSchedule && (
          <p className="text-xs text-muted">
            Scheduling works only for private videos that were never public. Make this video private first if you
            want to schedule it.
          </p>
        )}

        {mode === "schedule" && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="publish-at">
              Publish at (your local time)
            </label>
            <input
              id="publish-at"
              type="datetime-local"
              value={publishLocal}
              min={minLocal}
              onChange={(e) => setPublishLocal(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </Card>

      <ThumbnailCard video={current} />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-ink-950/95 px-4 py-3 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {saveNotice && !(saveNotice.kind === "ok" && dirty) && <NoticeBox notice={saveNotice} />}
          {confirmPublish && (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <p>This will make the video public right away.</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={() => save(true)}>
                  Yes, publish
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmPublish(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{dirty ? "Unsaved changes" : "No changes"}</span>
            <Button type="button" onClick={() => save()} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save to YouTube"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
