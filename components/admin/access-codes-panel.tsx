"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";

interface CodeRow {
  id: string;
  isActive: boolean;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export function AccessCodesPanel() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [maxUses, setMaxUses] = useState(10);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/codes");
    const data = await res.json();
    setCodes(data.codes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setJustCreated(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxUses }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.code) setJustCreated(data.code);
      else setError(data.error ?? "Couldn't create a code. Try again.");
    } catch {
      setError("Network problem — try again.");
    } finally {
      setGenerating(false);
      load();
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await fetch(`/api/admin/codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div>
          <label className="text-sm text-muted">Max uses</label>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
            className="mt-1 w-24 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
        </div>
        <Button type="button" onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate code"}
        </Button>
      </div>

      {justCreated && (
        <div className="rounded-md border border-saffron-500 bg-saffron-500/10 px-3 py-2 text-sm">
          <p className="text-muted">
            Copy this now — only the hash is stored, this code can&apos;t be shown again:
          </p>
          <p className="mt-1 select-all font-mono text-base tracking-wide text-saffron-400">{justCreated}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={async () => {
              setCopied(await copyText(justCreated));
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Copied ✓" : "Copy code"}
          </Button>
          <p className="mt-2 text-xs text-muted">
            Paste it in Settings → &ldquo;Have a code?&rdquo; to remove ads on that account.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {!loading && codes.length === 0 && <p className="text-sm text-muted">No codes yet.</p>}
        {codes.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
          >
            <div>
              <p className={c.isActive ? "" : "text-muted line-through"}>
                {c.usedCount}/{c.maxUses} used
              </p>
              <p className="text-xs text-muted">
                {c.expiresAt ? `Expires ${new Date(c.expiresAt).toLocaleDateString()}` : "No expiry"}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => handleToggle(c.id, c.isActive)}>
              {c.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
