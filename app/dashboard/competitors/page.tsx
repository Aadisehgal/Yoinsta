"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatIndianNumber } from "@/lib/utils";

interface ChannelStats {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

interface Competitor {
  id: string;
  channelId: string;
  title: string;
  channel: ChannelStats | null;
}

export default function CompetitorsPage() {
  const [myChannel, setMyChannel] = useState<ChannelStats | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const [dashRes, compRes] = await Promise.all([
      fetch("/api/youtube/dashboard").then((r) => r.json()),
      fetch("/api/youtube/competitors").then((r) => r.json()),
    ]);
    if (dashRes.connected && dashRes.channel) setMyChannel(dashRes.channel);
    setCompetitors(compRes.competitors ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);

    const res = await fetch("/api/youtube/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await res.json();

    if (data.error) {
      setError(data.error);
    } else {
      setInput("");
      load();
    }
    setAdding(false);
  }

  async function handleRemove(id: string) {
    await fetch(`/api/youtube/competitors/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-lg bg-ink-800" />;
  }

  if (!myChannel) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <Card className="items-center py-12">
          <CardTitle>Connect your YouTube channel first</CardTitle>
          <CardDescription>Competitor comparisons need your own channel&apos;s stats to compare against.</CardDescription>
          <a href="/api/youtube/connect">
            <Button className="mt-6">Connect YouTube</Button>
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Competitors</h1>
        <p className="mt-1 text-sm text-muted">Track up to 5 channels and see how you stack up.</p>
      </div>

      <Card>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Channel URL, @handle, or ID"
            className="flex-1 rounded-md border border-border bg-ink-950 px-3 py-2"
          />
          <Button type="submit" disabled={!input || adding}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>

      <Card>
        <CardTitle>You</CardTitle>
        <ChannelRow channel={myChannel} />
      </Card>

      {competitors.map((c) => (
        <Card key={c.id}>
          <div className="flex items-center justify-between">
            <CardTitle>{c.title}</CardTitle>
            <Button type="button" variant="destructive" size="sm" onClick={() => handleRemove(c.id)}>
              Remove
            </Button>
          </div>
          {c.channel ? (
            <ChannelRow channel={c.channel} compareTo={myChannel} />
          ) : (
            <p className="mt-3 text-sm text-muted">Couldn&apos;t load this channel&apos;s stats right now.</p>
          )}
        </Card>
      ))}

      {competitors.length === 0 && (
        <p className="text-center text-sm text-muted">No competitors added yet.</p>
      )}
    </div>
  );
}

function ChannelRow({ channel, compareTo }: { channel: ChannelStats; compareTo?: ChannelStats }) {
  return (
    <div className="mt-4 flex items-center gap-4">
      {channel.thumbnail && (
        <Image src={channel.thumbnail} alt={channel.title} width={48} height={48} className="rounded-full" />
      )}
      <div className="grid flex-1 grid-cols-3 gap-2 text-sm">
        <Stat label="Subscribers" value={channel.subscriberCount} compareTo={compareTo?.subscriberCount} />
        <Stat label="Total views" value={channel.viewCount} compareTo={compareTo?.viewCount} />
        <Stat label="Videos" value={channel.videoCount} compareTo={compareTo?.videoCount} />
      </div>
    </div>
  );
}

function Stat({ label, value, compareTo }: { label: string; value: number; compareTo?: number }) {
  const ahead = compareTo !== undefined && value > compareTo;
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={ahead ? "font-medium text-teal-400" : "font-medium"}>{formatIndianNumber(value)}</p>
    </div>
  );
}
