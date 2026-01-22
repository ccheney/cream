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
			"max-age=31536000; includeSubDomains; preload",
		);

		// CSP in production (development needs unsafe-eval for HMR)
		// Note: API URL must be included in connect-src for cross-origin requests
		const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
		const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";
		response.headers.set(
			"Content-Security-Policy",
			[
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline'",
				"style-src 'self' 'unsafe-inline'",
				"img-src 'self' data: https: blob:",
				"font-src 'self' data:",
				`connect-src 'self' ${apiUrl} ${wsUrl} wss: ws:`,
				"frame-src 'self'",
				"frame-ancestors 'none'",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			].join("; "),
		);
	}

	return response;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/api"];

// Cookie name for session token (set by better-auth with cookiePrefix: "cream")
const AUTH_COOKIE_NAME = "cream.session_token";

export default async function proxy(request: NextRequest) {
	const path = request.nextUrl.pathname;

	// Skip proxy for static files (no security headers needed)
	if (path.startsWith("/_next") || path.startsWith("/favicon") || path.includes(".")) {
		return NextResponse.next();
	}

	// Skip auth check for public routes and API calls, but add security headers
	if (PUBLIC_ROUTES.some((route) => path.startsWith(route))) {
		return addSecurityHeaders(NextResponse.next());
	}

	// Check for auth cookie
	const authCookie = request.cookies.get(AUTH_COOKIE_NAME);

	// No auth cookie - redirect to login
	if (!authCookie) {
		const loginUrl = new URL("/login", request.nextUrl);
		// Store the intended destination for post-login redirect
		loginUrl.searchParams.set("redirect", path);
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
