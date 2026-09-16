import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const isDashboard = pathname.startsWith("/dashboard");
  const isAdminPinPage = pathname === "/admin/pin";
  const isAdminArea = pathname.startsWith("/admin") && !isAdminPinPage;
  const isAdminApi = pathname.startsWith("/api/admin") && pathname !== "/api/admin/verify-pin";

  // Not logged in → send anywhere protected to /login
  if ((isDashboard || isAdminArea || isAdminPinPage || isAdminApi) && !token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if ((isAdminArea || isAdminApi || isAdminPinPage) && token) {
    // Role check happens here AND again server-side in each admin route handler —
    // "double check" per spec section 6 rule 6.
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Admin PIN must be confirmed for this session before reaching real admin pages/APIs.
    if ((isAdminArea || isAdminApi) && !token.adminPinOk) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Admin PIN required." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/pin", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/admin/:path*"],
};
