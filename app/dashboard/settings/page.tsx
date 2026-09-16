"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PROVIDERS = [
  { id: "groq", label: "Groq" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "claude", label: "Claude" },
];

type SavedKey = {
  id: string;
  provider: string;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
};

type YouTubeStatus = {
  connected: boolean;
  channel?: { title: string; thumbnail: string | null; connectedAt: string } | null;
};

type Status =
  | { type: "idle" }
  | { type: "testing" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function SettingsPage() {
  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [provider, setProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [youtube, setYoutube] = useState<YouTubeStatus | null>(null);

  async function loadYoutubeStatus() {
    const res = await fetch("/api/youtube/status");
    setYoutube(await res.json());
  }

  async function handleDisconnectYoutube() {
    await fetch("/api/youtube/disconnect", { method: "POST" });
    loadYoutubeStatus();
  }

  async function loadKeys() {
    const res = await fetch("/api/keys");
    const data = await res.json();
    setKeys(data.keys ?? []);
    setLoadingKeys(false);
  }

  useEffect(() => {
    loadKeys();
    loadYoutubeStatus();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ type: "testing" });

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = await res.json();

    if (data.testOk) {
      setStatus({ type: "success", message: `${provider} key saved and working.` });
      setApiKey("");
    } else {
      setStatus({
        type: "error",
        message: data.error ?? "Key saved, but the test call failed.",
      });
    }
    loadKeys();
  }

  async function handleRetest(prov: string) {
    setStatus({ type: "testing" });
    const res = await fetch("/api/keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: prov }),
    });
    const data = await res.json();
    setStatus(
      data.testOk
        ? { type: "success", message: `${prov} is still working.` }
        : { type: "error", message: data.error ?? "Test failed." }
    );
    loadKeys();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    loadKeys();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">AI keys (BYOK)</h1>
        <p className="mt-1 text-sm text-muted">
          Bring your own Groq, Gemini, OpenAI, or Claude key. Yoinsta never pays for your AI calls
          — your key is encrypted and used server-side only.
        </p>
      </div>

      <Card>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>Your YouTube channel.</CardDescription>

        <div className="mt-4">
          {youtube === null && <p className="text-sm text-muted">Loading…</p>}
          {youtube?.connected && youtube.channel ? (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <p className="text-sm font-medium">{youtube.channel.title}</p>
              <Button type="button" variant="destructive" size="sm" onClick={handleDisconnectYoutube}>
                Disconnect
              </Button>
            </div>
          ) : (
            youtube !== null && (
              <a href="/api/youtube/connect">
                <Button type="button" variant="secondary" size="sm">
                  Connect YouTube
                </Button>
              </a>
            )
          )}
        </div>
      </Card>

      <Card>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-sm text-muted">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-ink-950 px-3 py-2"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your key"
              className="mt-1 w-full rounded-md border border-border bg-ink-950 px-3 py-2 font-mono text-sm"
            />
          </div>

          {status.type === "success" && <p className="text-sm text-teal-400">{status.message}</p>}
          {status.type === "error" && <p className="text-sm text-red-400">{status.message}</p>}

          <Button type="submit" disabled={!apiKey || status.type === "testing"}>
            {status.type === "testing" ? "Testing connection…" : "Save & test connection"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Your keys</CardTitle>
        <CardDescription>One key per provider.</CardDescription>

        <div className="mt-4 space-y-2">
          {loadingKeys && <p className="text-sm text-muted">Loading…</p>}
          {!loadingKeys && keys.length === 0 && (
            <p className="text-sm text-muted">No keys added yet.</p>
          )}
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium capitalize">{k.provider}</p>
                <p className="text-xs text-muted">
                  {k.lastTestOk ? "Connected" : k.lastTestOk === false ? "Last test failed" : "Not tested"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => handleRetest(k.provider)}>
                  Re-test
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(k.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
