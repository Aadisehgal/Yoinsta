"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    // Injected by the Android wrapper app (yoinsta-android repo) via
    // webView.addJavascriptInterface(..., "AndroidAds"). Absent in a
    // regular browser — that's how we detect which path to take.
    AndroidAds?: { showRewardedAd: (nonce: string) => void };
    // We define this; the native side calls it when the ad finishes.
    onNativeAdResult?: (nonce: string, earned: boolean) => void;
  }
}

/**
 * Wrap any per-resource content (one video's SEO score, one topic's keyword
 * research, etc.) with this. Unlocked once per `resourceKey` per user —
 * a different resourceKey needs a fresh ad. Ad-free users skip straight
 * through (checked server-side, not just hidden client-side).
 *
 * Shows a real AdMob rewarded ad when running inside the Android wrapper
 * app, otherwise falls back to a 5s mock ad (plain browser / dev testing).
 */
export function AdGate({
  resourceKey,
  label = "this",
  children,
}: {
  resourceKey: string;
  label?: string;
  children: React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null); // null = checking
  const [watching, setWatching] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pendingNonceRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/status?resourceKey=${encodeURIComponent(resourceKey)}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setUnlocked(Boolean(d.unlocked)))
      .catch(() => !cancelled && setUnlocked(false));
    return () => {
      cancelled = true;
    };
  }, [resourceKey]);

  // Listens for the Android app's callback after a real AdMob rewarded ad closes.
  useEffect(() => {
    window.onNativeAdResult = (nonce, earned) => {
      if (nonce !== pendingNonceRef.current) return; // stale/unrelated callback
      setWatching(false);
      if (earned) {
        completeUnlock(nonce);
      } else {
        setError("Ad wasn't completed — try again.");
      }
    };
    return () => {
      delete window.onNativeAdResult;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleWatchAd() {
    setError(null);
    const startRes = await fetch("/api/ads/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceKey }),
    });
    const startData = await startRes.json();

    if (startData.alreadyUnlocked) {
      setUnlocked(true);
      return;
    }
    if (!startData.nonce) {
      setError(startData.error ?? "Couldn't start the ad.");
      return;
    }

    pendingNonceRef.current = startData.nonce;
    setWatching(true);

    if (window.AndroidAds?.showRewardedAd) {
      window.AndroidAds.showRewardedAd(startData.nonce); // real AdMob ad — result via onNativeAdResult
    } else {
      runMockAd(startData.nonce); // plain browser fallback
    }
  }

  // Placeholder rewarded-ad player for plain-browser testing — a 5s
  // countdown standing in for the real AdMob ad shown by the Android app.
  function runMockAd(nonce: string) {
    let secondsLeft = 5;
    setCountdown(secondsLeft);
    const interval = setInterval(() => {
      secondsLeft -= 1;
      setCountdown(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(interval);
        setWatching(false);
        completeUnlock(nonce);
      }
    }, 1000);
  }

  async function completeUnlock(nonce: string) {
    const res = await fetch("/api/ads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    const data = await res.json();

    if (data.unlocked) {
      setUnlocked(true);
    } else {
      setError(data.error ?? "Ad verification failed — try again.");
    }
  }

  if (unlocked === null) {
    return <p className="text-sm text-muted">Checking access…</p>;
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <Card className="items-center py-10 text-center">
      <CardTitle>Watch an ad to unlock {label}</CardTitle>
      <CardDescription>
        One short ad unlocks this — a different video or topic needs a fresh one.
      </CardDescription>

      {watching ? (
        <div className="mt-6 flex h-40 w-full max-w-xs items-center justify-center rounded-md border border-dashed border-border text-muted">
          {window.AndroidAds ? "Ad playing…" : `Ad playing… ${countdown}s`}
        </div>
      ) : (
        <Button type="button" className="mt-6" onClick={handleWatchAd}>
          Watch ad to unlock
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </Card>
  );
}
