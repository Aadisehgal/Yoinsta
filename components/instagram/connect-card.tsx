"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function ConnectCard({ configured, needsReconnect }: { configured: boolean; needsReconnect: boolean }) {
  if (!configured) {
    return (
      <Card className="space-y-3">
        <CardTitle>Instagram isn&apos;t set up on the server yet</CardTitle>
        <CardDescription>
          The app owner has to finish the one-time Meta setup (create the Instagram app and add its ID and secret to the
          server settings). Until then, the Create tab still works.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{needsReconnect ? "Reconnect Instagram" : "Connect your Instagram"}</CardTitle>
        <CardDescription>
          {needsReconnect
            ? "Your Instagram sign-in expired. Connect again to see your numbers."
            : "See what your posts really do — reach, views, saves, the best time to post — and let the AI chat answer questions about them."}
        </CardDescription>
      </div>
      <a
        href="/api/instagram/connect"
        className="inline-block rounded-md bg-saffron-500 px-4 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-saffron-400"
      >
        {needsReconnect ? "Reconnect Instagram" : "Connect Instagram"}
      </a>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
        <li>Needs a Business or Creator account (Instagram app → Settings → Account type and tools → Switch to professional).</li>
        <li>You&apos;ll log in on Instagram itself; Yoinsta only gets read access to your profile, posts and insights.</li>
        <li>You can disconnect any time.</li>
      </ul>
    </Card>
  );
}
