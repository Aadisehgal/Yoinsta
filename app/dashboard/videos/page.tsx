"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NoticeBox, type Notice } from "@/components/video/notice-box";
import { cn } from "@/lib/utils";
import { formatIndianNumber } from "@/lib/utils";
import type { EditableVideo } from "@/lib/video-edit";

interface ListResponse {
  connected?: boolean;
  videos?: EditableVideo[];
  nextPageToken?: string;
  error?: string;
  code?: string;
}

function StatusBadge({ video }: { video: EditableVideo }) {
  const scheduled = video.privacyStatus === "private" && video.publishAt;
  const label = scheduled
    ? `Scheduled · ${new Date(video.publishAt as string).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })}`
    : video.privacyStatus.charAt(0).toUpperCase() + video.privacyStatus.slice(1);
  const style = scheduled
    ? "bg-sky-500/15 text-sky-300"
    : video.privacyStatus === "public"
      ? "bg-emerald-500/15 text-emerald-300"
      : video.privacyStatus === "unlisted"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-ink-700 text-muted";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs", style)}>{label}</span>;
}

export default function VideosPage() {
  const [videos, setVideos] = useState<EditableVideo[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async (pageToken?: string) => {
    setLoading(true);
    setNotice(null);
    try {
      const url = pageToken
        ? `/api/youtube/manage/videos?pageToken=${encodeURIComponent(pageToken)}`
        : "/api/youtube/manage/videos";
      const res = await fetch(url);
      const data = (await res.json().catch(() => ({}))) as ListResponse;
      if (data.connected === false) {
        setConnected(false);
        return;
      }
      if (!res.ok) {
        setNotice({ kind: "error", text: data.error ?? "Couldn't load your videos.", code: data.code });
        return;
      }
      setVideos((prev) => (pageToken ? [...prev, ...(data.videos ?? [])] : (data.videos ?? [])));
      setNext(data.nextPageToken);
    } catch {
      setNotice({ kind: "error", text: "Network problem — check your connection." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Videos</h1>
        <p className="mt-1 text-sm text-muted">
          Edit titles, descriptions, tags, thumbnails and visibility — or let AI review them. Includes unlisted,
          private and scheduled videos.
        </p>
      </div>

      {!connected && (
        <Card className="space-y-3">
          <p className="text-sm">Connect your YouTube channel to manage your videos.</p>
          <a
            href="/api/youtube/connect"
            className="inline-block rounded-md bg-saffron-500 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-saffron-400"
          >
            Connect YouTube
          </a>
        </Card>
      )}

      {notice && <NoticeBox notice={notice} />}

      <div className="space-y-2">
        {videos.map((v) => (
          <Link
            key={v.id}
            href={`/dashboard/videos/${v.id}`}
            className="flex gap-3 rounded-lg border border-border bg-ink-900 p-3 transition-colors hover:bg-ink-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={v.thumbnail}
              alt=""
              className="aspect-video w-28 shrink-0 rounded-md bg-ink-950 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge video={v} />
                <span className="text-xs text-muted">{formatIndianNumber(v.views)} views</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {loading && <p className="text-sm text-muted">Loading videos…</p>}
      {!loading && connected && videos.length === 0 && !notice && (
        <p className="text-sm text-muted">No videos found on this channel yet.</p>
      )}

      {!loading && next && (
        <Button type="button" variant="secondary" onClick={() => load(next)}>
          Load more
        </Button>
      )}
    </div>
  );
}
