import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

/**
 * ADMIN_EMAILS is the ONLY source of admin role (spec section 6, rule 1 & 2).
 * No UI, API, or code-redemption path may ever set role = "ADMIN".
 */
function isWhitelistedAdmin(email: string): boolean {
  const whitelist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return whitelist.includes(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const role = isWhitelistedAdmin(user.email) ? "ADMIN" : "USER";

      // Upsert keeps the whitelist authoritative on every login — if an email is
      // removed from ADMIN_EMAILS, the next login demotes it back to USER.
      await prisma.user.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          role,
        },
        update: {
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          role,
        },
      });

      return true;
    },

    async jwt({ token, trigger, session }) {
      // Admin PIN confirmation arrives via the client calling update({ adminPinOk: true })
      // after /api/admin/verify-pin succeeds (spec section 6, rule 3).
      if (trigger === "update" && session?.adminPinOk) {
        token.adminPinOk = true;
        return token;
      }

      if (!token.email) return token;

      const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
      if (dbUser) {
        token.id = dbUser.id;
        token.role = dbUser.role;
        token.adFree = dbUser.adFree;
        // A fresh sign-in always requires the PIN again, even for a returning admin.
        if (trigger === "signIn") {
          token.adminPinOk = false;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.adFree = Boolean(token.adFree);
        session.user.adminPinOk = Boolean(token.adminPinOk);
      }
      return session;
    },
  },
};
