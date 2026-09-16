import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <span className="text-sm text-muted mb-4">YouTube + Instagram, one dashboard</span>
      <h1 className="font-display text-4xl sm:text-6xl font-medium max-w-3xl leading-tight">
        Ek App. Do Platforms.{" "}
        <span className="text-saffron-500">Unlimited Growth.</span>
      </h1>
      <p className="mt-6 max-w-xl text-muted">
        Bring your own Groq, Gemini, OpenAI, or Claude key — Yoinsta never charges you for AI.
        Just ₹0–799/month for the analytics.
      </p>
      <Link
        href="/login"
        className="mt-10 rounded-md bg-saffron-500 px-6 py-3 font-medium text-ink-950 hover:bg-saffron-400 transition-colors"
      >
        Get started free
      </Link>
    </main>
  );
}
