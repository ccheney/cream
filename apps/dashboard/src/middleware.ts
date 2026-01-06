/**
 * Next.js Middleware
 *
 * Handles authentication redirects:
 * - Unauthenticated users → /login
 * - Authenticated users on /login → /dashboard
 *
 * Note: This middleware uses cookie presence as a hint.
 * Full authentication validation happens server-side.
 *
 * @see docs/plans/ui/09-security.md
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/api"];

// Cookie name for access token (set by dashboard-api)
const AUTH_COOKIE_NAME = "cream_access_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public routes and API calls
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Skip middleware for static files
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);

  // No auth cookie - redirect to login
  if (!authCookie) {
    const loginUrl = new URL("/login", request.url);
    // Store the intended destination for post-login redirect
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Has auth cookie - allow access
  // Note: The actual token validation happens in the API/SSR
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
