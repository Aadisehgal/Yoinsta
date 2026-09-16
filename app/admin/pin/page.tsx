"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AdminPinPage() {
  const { update } = useSession();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      await update({ adminPinOk: true });
      router.push("/admin");
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Incorrect PIN.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-ink-900 p-8"
      >
        <h1 className="font-display text-2xl font-medium">Admin PIN</h1>
        <p className="mt-2 text-sm text-muted">
          Required every admin session, even for an already-logged-in admin.
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mt-6 w-full rounded-md border border-border bg-ink-950 px-3 py-2.5 tracking-widest focus-visible:outline-none"
          placeholder="••••••"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <Button type="submit" disabled={loading || !pin} className="mt-6 w-full">
          {loading ? "Checking…" : "Unlock admin panel"}
        </Button>
      </form>
    </main>
  );
}
