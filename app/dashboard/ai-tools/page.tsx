"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "chat" | "titles";

export default function AiToolsPage() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">AI Tools</h1>
        <p className="mt-1 text-sm text-muted">
          Powered by your own AI key — add one in Settings first if you haven&apos;t.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
          Channel Audit
        </TabButton>
        <TabButton active={tab === "titles"} onClick={() => setTab("titles")}>
          Title Generator
        </TabButton>
      </div>

      {tab === "chat" ? <ChannelAuditChat /> : <TitleGenerator />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm",
        active ? "border-saffron-500 text-white" : "border-transparent text-muted hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Why aren't my views growing?",
  "Audit my last few videos — what's working and what isn't?",
  "What should I upload next based on my recent performance?",
];

function ChannelAuditChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next }),
    });
    const data = await res.json();

    if (data.success) {
      setMessages([...next, { role: "assistant" as const, content: data.content }]);
    } else {
      setError(data.error ?? "Something went wrong.");
    }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 && (
        <Card>
          <CardTitle>Ask about your channel</CardTitle>
          <CardDescription>Reads your real stats and recent videos — not generic advice.</CardDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:bg-ink-800 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
      )}

      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-saffron-500/10 px-4 py-2 text-sm"
                  : "mr-8 whitespace-pre-wrap rounded-lg border border-border bg-ink-900 px-4 py-2 text-sm"
              }
            >
              {m.content}
            </div>
          ))}
          {loading && <p className="text-sm text-muted">Analyzing your channel…</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your channel…"
          className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
        />
        <Button type="submit" disabled={!input || loading}>
          Send
        </Button>
      </form>
    </div>
  );
}

function TitleGenerator() {
  const [topic, setTopic] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTitles([]);

    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "titles", topic }),
    });
    const data = await res.json();

    if (data.success) {
      const lines = (data.content as string)
        .split("\n")
        .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      setTitles(lines);
    } else {
      setError(data.error ?? "Something went wrong.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={handleGenerate} className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What's the video about?"
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!topic || loading}>
            {loading ? "Generating…" : "Generate 5 titles"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>

      {titles.length > 0 && (
        <Card>
          <CardTitle>Suggestions</CardTitle>
          <ul className="mt-3 space-y-2">
            {titles.map((t, i) => (
              <li key={i} className="rounded-md bg-ink-800 px-3 py-2 text-sm">
                {t}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
