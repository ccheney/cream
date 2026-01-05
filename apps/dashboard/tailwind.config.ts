/**
 * Tailwind CSS Configuration
 *
 * Cream Design System with warm neutral palette, semantic colors,
 * custom typography, and animation system.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/21-color-system.md
 * @see docs/plans/ui/22-typography.md
 * @see docs/plans/ui/25-motion.md
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      // ============================================
      // Font Families
      // ============================================
      fontFamily: {
        ui: [
          "Satoshi",
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        mono: [
          "Geist Mono",
          "JetBrains Mono",
          "SF Mono",
          "Consolas",
          "monospace",
        ],
      },

      // ============================================
      // Font Sizes (Custom Scale)
      // ============================================
      fontSize: {
        xs: ["11px", { lineHeight: "1.4", fontWeight: "400" }],
        sm: ["13px", { lineHeight: "1.45", fontWeight: "400" }],
        base: ["15px", { lineHeight: "1.5", fontWeight: "400" }],
        lg: ["17px", { lineHeight: "1.45", fontWeight: "500" }],
        xl: ["20px", { lineHeight: "1.35", fontWeight: "600" }],
        "2xl": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "3xl": ["30px", { lineHeight: "1.25", fontWeight: "700" }],
        "4xl": ["36px", { lineHeight: "1.2", fontWeight: "700" }],
      },

      // ============================================
      // Colors
      // ============================================
      colors: {
        // Base Palette: Cream (Light Mode)
        cream: {
          50: "#FFFDF9",
          100: "#FBF8F3",
          200: "#F5F1EA",
          300: "#EBE5DA",
        },
        // Base Palette: Stone (Warm Grays)
        stone: {
          400: "#A8A198",
          500: "#7A746B",
          600: "#5C564E",
          700: "#3D3832",
          900: "#1C1917",
        },
        // Base Palette: Night (Dark Mode)
        night: {
          50: "#FAFAF9",
          100: "#F5F5F4",
          200: "#D6D3D1",
          300: "#A8A29E",
          400: "#78716C",
          700: "#2D2926",
          800: "#1F1C1A",
          900: "#141211",
          950: "#0C0A09",
        },
        // Semantic: Trading States
        profit: {
          DEFAULT: "#22C55E",
          muted: "#166534",
          bg: "rgba(34, 197, 94, 0.1)",
        },
        loss: {
          DEFAULT: "#EF4444",
          muted: "#991B1B",
          bg: "rgba(239, 68, 68, 0.1)",
        },
        neutral: {
          DEFAULT: "#F59E0B",
          muted: "#92400E",
          bg: "rgba(245, 158, 11, 0.1)",
        },
        // Semantic: System States
        active: {
          DEFAULT: "#F5A623",
          glow: "rgba(245, 166, 35, 0.4)",
        },
        success: {
          DEFAULT: "#10B981",
          bg: "rgba(16, 185, 129, 0.1)",
        },
        warning: {
          DEFAULT: "#FBBF24",
          bg: "rgba(251, 191, 36, 0.1)",
        },
        critical: {
          DEFAULT: "#DC2626",
          bg: "rgba(220, 38, 38, 0.1)",
          glow: "rgba(220, 38, 38, 0.3)",
        },
        info: {
          DEFAULT: "#6366F1",
          bg: "rgba(99, 102, 241, 0.1)",
        },
        // Agent Colors
        agent: {
          technical: "#8B5CF6",
          sentiment: "#EC4899",
          fundamentals: "#14B8A6",
          bullish: "#22C55E",
          bearish: "#EF4444",
          trader: "#F59E0B",
          risk: "#F97316",
          critic: "#6366F1",
        },
        // Interactive States
        primary: {
          DEFAULT: "#D97706",
          hover: "#B45309",
          active: "#92400E",
        },
        secondary: {
          DEFAULT: "#78716C",
          hover: "#57534E",
          active: "#44403C",
        },
        destructive: {
          DEFAULT: "#DC2626",
          hover: "#B91C1C",
        },
        // Chart Colors
        chart: {
          1: "#D97706",
          2: "#6366F1",
          3: "#14B8A6",
          4: "#EC4899",
          5: "#8B5CF6",
          6: "#F97316",
          7: "#22D3EE",
          8: "#84CC16",
        },
      },

      // ============================================
      // Border Radius
      // ============================================
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },

      // ============================================
      // Box Shadows
      // ============================================
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
        md: "0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)",
        lg: "0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)",
        xl: "0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)",
        // Dark mode shadows
        "dark-sm": "0 1px 2px rgba(0, 0, 0, 0.3)",
        "dark-md": "0 4px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)",
        "dark-lg":
          "0 10px 15px rgba(0, 0, 0, 0.5), 0 4px 6px rgba(0, 0, 0, 0.4)",
        "dark-xl":
          "0 20px 25px rgba(0, 0, 0, 0.5), 0 10px 10px rgba(0, 0, 0, 0.4)",
      },

      // ============================================
      // Duration Tokens
      // ============================================
      transitionDuration: {
        instant: "100ms",
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
        slower: "600ms",
      },

      // ============================================
      // Easing Tokens
      // ============================================
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out-expo": "cubic-bezier(0.65, 0, 0.35, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      // ============================================
      // Keyframe Definitions
      // ============================================
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        spin: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "flash-profit": {
          "0%": { backgroundColor: "rgba(34, 197, 94, 0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-loss": {
          "0%": { backgroundColor: "rgba(239, 68, 68, 0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in-top": {
          from: { transform: "translateY(-100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "scale-out": {
          from: { transform: "scale(1)", opacity: "1" },
          to: { transform: "scale(0.95)", opacity: "0" },
        },
        bounce: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10%)" },
        },
        "checkmark-draw": {
          "0%": { strokeDashoffset: "50" },
          "100%": { strokeDashoffset: "0" },
        },
      },

      // ============================================
      // Animation Utilities
      // ============================================
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "pulse-slow": "pulse 2s ease-in-out infinite",
        "spin-slow": "spin 1.5s linear infinite",
        "spin-fast": "spin 0.5s linear infinite",
        "flash-profit": "flash-profit 500ms ease-out",
        "flash-loss": "flash-loss 500ms ease-out",
        "fade-in": "fade-in 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-out": "fade-out 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-top": "slide-in-top 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-bottom": "slide-in-bottom 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-left": "slide-in-left 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-out": "scale-out 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        "bounce-slow": "bounce 1s ease infinite",
        checkmark: "checkmark-draw 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },

      // ============================================
      // Animation Delays
      // ============================================
      animationDelay: {
        "100": "100ms",
        "200": "200ms",
        "300": "300ms",
        "500": "500ms",
        "700": "700ms",
        "1000": "1000ms",
      },

      // ============================================
      // Colors (Animation-specific)
      // ============================================
      colors: {
        profit: {
          DEFAULT: "#22c55e", // green-500
          bg: "rgba(34, 197, 94, 0.2)",
        },
        loss: {
          DEFAULT: "#ef4444", // red-500
          bg: "rgba(239, 68, 68, 0.2)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
