import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React Compiler (stable in Next.js 16)
  // Provides automatic memoization to reduce re-renders
  reactCompiler: true,

  // Turbopack configuration (promoted to top-level in Next.js 16)
  // Provides sub-100ms HMR
  turbopack: {
    // Custom resolve aliases if needed
    resolveAlias: {
      // Add any package aliases here
    },
  },

  // Enable typed routes for type-safe navigation (promoted to top-level in Next.js 16)
  typedRoutes: true,

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
