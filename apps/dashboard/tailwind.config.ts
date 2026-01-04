/**
 * Tailwind CSS Configuration
 *
 * Extends Tailwind with custom animation keyframes, timing, and easing.
 *
 * @see docs/plans/ui/25-motion.md
 * @see docs/plans/ui/28-states.md
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
