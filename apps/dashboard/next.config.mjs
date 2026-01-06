/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments
  output: "standalone",

  // Enable React Compiler (stable in Next.js 16)
  // Provides automatic memoization to reduce re-renders
  reactCompiler: true,

  // Turbopack configuration (promoted to top-level in Next.js 16)
  // Provides sub-100ms HMR
  turbopack: {
    // Set root for monorepo builds (required for Docker)
    // Uses TURBOPACK_ROOT env var, auto-detects Docker, or undefined for local dev
    root: process.env.TURBOPACK_ROOT
      ? process.env.TURBOPACK_ROOT
      : process.cwd().startsWith("/app/apps/")
        ? "/app"
        : undefined,
    // Custom resolve aliases if needed
    resolveAlias: {
      // Add any package aliases here
    },
  },

  // Production optimizations
  poweredByHeader: false,

  // Strict mode for development
  reactStrictMode: true,

  // TypeScript configuration
  typescript: {
    // Enable type checking during build
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
