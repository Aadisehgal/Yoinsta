"use client";

import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

export function Topbar() {
  const { data: session } = useSession();
  if (!session) return null;

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <div />
      <div className="flex items-center gap-4">
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
          {session.user.adFree ? "Ad-free" : "Free · supported by ads"}
        </span>
        {session.user.image && (
          <button onClick={() => signOut({ callbackUrl: "/" })} title="Sign out">
            <Image
              src={session.user.image}
              alt={session.user.name ?? "Account"}
              width={32}
              height={32}
              className="rounded-full"
            />
          </button>
        )}
      </div>
    </header>
  );
}
