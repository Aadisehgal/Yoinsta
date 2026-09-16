"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginCard() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const error = params.get("error");

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-ink-900 p-8">
      <h1 className="font-display text-2xl font-medium">Log in to Yoinsta</h1>
      <p className="mt-2 text-sm text-muted">
        One account for your YouTube and Instagram growth.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          Couldn&apos;t sign you in. Please try again.
        </p>
      )}

      <button
        onClick={() => signIn("google", { callbackUrl })}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 font-medium text-ink-950 hover:bg-white/90 transition-colors"
      >
        Continue with Google
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
