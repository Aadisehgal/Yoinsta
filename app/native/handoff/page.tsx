import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const APP_PACKAGE = "com.yoinsta.app";
const CODE_TTL_SECONDS = 120;

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-ink-900 p-8 text-center">
        <h1 className="font-display text-2xl font-medium">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/**
 * Step 2: the person is now signed in inside Chrome. Create a single-use code (bound to the
 * challenge the app generated) and offer a button that opens the Yoinsta app with it. The app
 * trades code + its secret verifier for a session at /api/native/exchange.
 */
export default async function NativeHandoffPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=%2Fnative%2Fhandoff");

  const challenge = cookies().get("native_challenge")?.value ?? "";
  const dashboardUrl = `${process.env.NEXTAUTH_URL}/dashboard`;

  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return (
      <Shell title="Start from the app">
        <p className="mt-2 text-sm text-muted">
          Open the Yoinsta app and tap &ldquo;Continue with Google&rdquo; to sign in.
        </p>
        <a
          href={dashboardUrl}
          className="mt-6 inline-block text-sm text-muted underline underline-offset-4"
        >
          Or continue in the browser
        </a>
      </Shell>
    );
  }

  const code = crypto.randomBytes(24).toString("base64url");
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  await redis.set(
    `native:code:${codeHash}`,
    JSON.stringify({ email: session.user.email, challenge }),
    "EX",
    CODE_TTL_SECONDS
  );

  const openApp =
    `intent://auth?code=${code}#Intent;scheme=yoinsta;package=${APP_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(dashboardUrl)};end`;

  return (
    <Shell title="You're signed in">
      <p className="mt-2 text-sm text-muted">Tap the button to go back to the Yoinsta app.</p>
      <a
        href={openApp}
        className="mt-6 block rounded-md bg-saffron-500 px-6 py-3 font-medium text-ink-950 hover:bg-saffron-400 transition-colors"
      >
        Open Yoinsta
      </a>
      <a
        href={dashboardUrl}
        className="mt-4 inline-block text-sm text-muted underline underline-offset-4"
      >
        Or continue in the browser
      </a>
    </Shell>
  );
}
