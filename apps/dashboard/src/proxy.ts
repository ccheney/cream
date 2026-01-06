/**
 * Next.js Proxy
 *
 * Handles authentication redirects and security headers:
 * - Unauthenticated users → /login
 * - Authenticated users on /login → /dashboard
 * - Security headers (CSP, X-Frame-Options, etc.)
 *
 * Note: This proxy uses cookie presence as a hint.
 * Full authentication validation happens server-side.
 *
 * @see docs/plans/ui/09-security.md
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ============================================
// Security Headers
// ============================================

/**
 * Add security headers to a response.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  const isProduction = process.env.NODE_ENV === "production";

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // XSS protection (legacy, but still useful)
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Control referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // DNS prefetch control
  response.headers.set("X-DNS-Prefetch-Control", "on");

  // Prevent Adobe products from handling data
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  // HSTS only in production
  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );

    // CSP in production (development needs unsafe-eval for HMR)
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' wss: ws: https://api.polygon.io https://api.massive.com https://financialmodelingprep.com",
        "frame-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
  }

  return response;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/api"];

// Cookie name for access token (set by dashboard-api)
const AUTH_COOKIE_NAME = "cream_access";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip proxy for static files (no security headers needed)
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Skip auth check for public routes and API calls, but add security headers
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Check for auth cookie
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);

  // No auth cookie - redirect to login
  if (!authCookie) {
    const loginUrl = new URL("/login", request.url);
    // Store the intended destination for post-login redirect
    loginUrl.searchParams.set("redirect", pathname);
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // Has auth cookie - allow access with security headers
  // Note: The actual token validation happens in the API/SSR
  return addSecurityHeaders(NextResponse.next());
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
