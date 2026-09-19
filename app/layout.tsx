import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend" });

export const metadata: Metadata = {
  title: "Yoinsta — Ek App. Do Platforms. Unlimited Growth.",
  description:
    "Grow on YouTube and Instagram from one dashboard. Bring your own AI key — Yoinsta pays zero AI costs, you pay ₹0–799/month.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${lexend.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
