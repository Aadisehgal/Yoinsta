"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CaptionTool } from "@/components/instagram/caption-tool";
import { ConnectCard } from "@/components/instagram/connect-card";
import { OverviewPanel, type OverviewData } from "@/components/instagram/overview-panel";
import { IgReportPanel } from "@/components/instagram/report-panel";
import { NoticeBox, type Notice } from "@/components/video/notice-box";

type Tab = "mine" | "create";

interface Status {
  configured: boolean;
  connected: boolean;
  username: string | null;
  needsReconnect: boolean;
}

const BANNERS: Record<string, Notice> = {
  connected: { kind: "ok", text: "Instagram connected. Loading your numbers…" },
  denied: { kind: "error", text: "You cancelled on Instagram, so nothing was connected." },
  expired: { kind: "error", text: "That Instagram sign-in expired or didn't match. Please try Connect again." },
  not_professional: {
    kind: "error",
    text: "That account isn't a Business or Creator account. Switch it to professional in the Instagram app, then connect again.",
  },
  not_configured: { kind: "error", text: "Instagram isn't set up on the server yet." },
  deleted: { kind: "ok", text: "Your Instagram data was removed from Yoinsta." },
  error: { kind: "error", text: "Couldn't finish connecting Instagram. Try again — and make sure your account was added as a tester if the app is still in testing." },
};

export default function InstagramPage() {
  return (
    <Suspense fallback={null}>
      <InstagramContent />
    </Suspense>
  );
}

function InstagramContent() {
  const params = useSearchParams();
  const banner = BANNERS[params.get("ig") ?? ""] ?? null;

  const [tab, setTab] = useState<Tab>("mine");
  const [status, setStatus] = useState<Status | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Notice | null>(null);

  const loadOverview = useCallback(async (refresh = false) => {
    setError(null);
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const st = (await fetch("/api/instagram/status").then((r) => r.json())) as Status;
      setStatus(st);
      if (!st.connected || st.needsReconnect) {
        setOverview(null);
        return;
      }
      const tz = -new Date().getTimezoneOffset();
      const res = await fetch(`/api/instagram/overview?tz=${tz}${refresh ? "&refresh=1" : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOverview(null);
        setError({ kind: "error", text: data.error ?? "Couldn't load your Instagram numbers.", code: undefined });
        if (data.code === "needs_reconnect") setStatus({ ...st, needsReconnect: true });
        return;
      }
      setOverview(data as OverviewData);
    } catch {
      setError({ kind: "error", text: "Network problem — check your connection and try again." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function disconnect() {
    await fetch("/api/instagram/disconnect", { method: "POST" }).catch(() => null);
    setOverview(null);
    void loadOverview();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Instagram</h1>
        <p className="mt-1 text-sm text-muted">See what works on your account, and write captions that get seen.</p>
      </div>

      {banner && <NoticeBox notice={banner} />}

      <div className="flex gap-2 border-b border-border">
        {([
          ["mine", "My Instagram"],
          ["create", "Create"],
        ] as [Tab, string][]).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
              tab === value ? "border-saffron-500 text-white" : "border-transparent text-muted hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "create" && <CaptionTool />}

      {tab === "mine" && (
        <div className="space-y-6">
          {loading && <div className="h-40 animate-pulse rounded-lg bg-ink-800" aria-label="Loading" />}
          {error && <NoticeBox notice={error} />}

          {!loading && status && (!status.connected || status.needsReconnect) && (
            <ConnectCard configured={status.configured} needsReconnect={status.needsReconnect} />
          )}

          {!loading && overview && (
            <>
              <IgReportPanel />
              <OverviewPanel data={overview} refreshing={refreshing} onRefresh={() => loadOverview(true)} onDisconnect={disconnect} />
            </>
          )}

          {!loading && status?.connected && !overview && !error && !status.needsReconnect && (
            <Card>
              <p className="text-sm text-muted">Couldn&apos;t load your numbers right now.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
