/**
 * Animation Utilities Tests
 *
 * Tests for CSS animation utilities and Tailwind configuration.
 *
 * @see docs/plans/ui/28-states.md lines 17-32
 * @see docs/plans/ui/25-motion.md
 */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// Read files for testing
const animationsCss = fs.readFileSync(path.join(__dirname, "animations.css"), "utf-8");

const tailwindConfig = fs.readFileSync(path.join(__dirname, "../../tailwind.config.ts"), "utf-8");

// ============================================
// CSS Custom Properties Tests
// ============================================

describe("CSS Custom Properties", () => {
  describe("Duration tokens", () => {
    it("defines --duration-instant", () => {
      expect(animationsCss).toContain("--duration-instant: 100ms");
    });

    it("defines --duration-fast", () => {
      expect(animationsCss).toContain("--duration-fast: 150ms");
    });

    it("defines --duration-normal", () => {
      expect(animationsCss).toContain("--duration-normal: 250ms");
    });

    it("defines --duration-slow", () => {
      expect(animationsCss).toContain("--duration-slow: 400ms");
    });

    it("defines --duration-slower", () => {
      expect(animationsCss).toContain("--duration-slower: 600ms");
    });
  });

  describe("Easing tokens", () => {
    it("defines --ease-out", () => {
      expect(animationsCss).toContain("--ease-out:");
      expect(animationsCss).toContain("cubic-bezier(0.16, 1, 0.3, 1)");
    });

    it("defines --ease-in-out", () => {
      expect(animationsCss).toContain("--ease-in-out:");
      expect(animationsCss).toContain("cubic-bezier(0.65, 0, 0.35, 1)");
    });

    it("defines --ease-spring", () => {
      expect(animationsCss).toContain("--ease-spring:");
      expect(animationsCss).toContain("cubic-bezier(0.34, 1.56, 0.64, 1)");
    });
  });

  describe("Animation colors", () => {
    it("defines --profit-bg", () => {
      expect(animationsCss).toContain("--profit-bg:");
    });

    it("defines --loss-bg", () => {
      expect(animationsCss).toContain("--loss-bg:");
    });
  });
});

// ============================================
// Keyframe Definitions Tests
// ============================================

describe("Keyframe Definitions", () => {
  it("defines shimmer keyframes", () => {
    expect(animationsCss).toContain("@keyframes shimmer");
    expect(animationsCss).toContain("background-position: -200% 0");
    expect(animationsCss).toContain("background-position: 200% 0");
  });

  it("defines pulse keyframes", () => {
    expect(animationsCss).toContain("@keyframes pulse");
    expect(animationsCss).toContain("opacity: 1");
    expect(animationsCss).toContain("opacity: 0.6");
  });

  it("defines spin keyframes", () => {
    expect(animationsCss).toContain("@keyframes spin");
    expect(animationsCss).toContain("rotate(0deg)");
    expect(animationsCss).toContain("rotate(360deg)");
  });

  it("defines flash-profit keyframes", () => {
    expect(animationsCss).toContain("@keyframes flash-profit");
    expect(animationsCss).toContain("var(--profit-bg)");
  });

  it("defines flash-loss keyframes", () => {
    expect(animationsCss).toContain("@keyframes flash-loss");
    expect(animationsCss).toContain("var(--loss-bg)");
  });

  it("defines fade-in keyframes", () => {
    expect(animationsCss).toContain("@keyframes fade-in");
  });

  it("defines fade-out keyframes", () => {
    expect(animationsCss).toContain("@keyframes fade-out");
  });

  it("defines slide-in-top keyframes", () => {
    expect(animationsCss).toContain("@keyframes slide-in-top");
    expect(animationsCss).toContain("translateY(-100%)");
  });

  it("defines slide-in-bottom keyframes", () => {
    expect(animationsCss).toContain("@keyframes slide-in-bottom");
    expect(animationsCss).toContain("translateY(100%)");
  });

  it("defines scale-in keyframes", () => {
    expect(animationsCss).toContain("@keyframes scale-in");
    expect(animationsCss).toContain("scale(0.95)");
  });

  it("defines bounce keyframes", () => {
    expect(animationsCss).toContain("@keyframes bounce");
  });

  it("defines checkmark-draw keyframes", () => {
    expect(animationsCss).toContain("@keyframes checkmark-draw");
    expect(animationsCss).toContain("stroke-dashoffset");
  });
});

// ============================================
// Animation Utility Classes Tests
// ============================================

describe("Animation Utility Classes", () => {
  it("defines .animate-shimmer", () => {
    expect(animationsCss).toContain(".animate-shimmer");
    expect(animationsCss).toContain("animation: shimmer 1.5s infinite");
  });

  it("defines .animate-pulse", () => {
    expect(animationsCss).toContain(".animate-pulse");
    expect(animationsCss).toContain("animation: pulse 2s ease-in-out infinite");
  });

  it("defines .animate-spin", () => {
    expect(animationsCss).toContain(".animate-spin");
    expect(animationsCss).toContain("animation: spin 1s linear infinite");
  });

  it("defines .animate-flash-profit", () => {
    expect(animationsCss).toContain(".animate-flash-profit");
    expect(animationsCss).toContain("flash-profit 500ms ease-out");
  });

  it("defines .animate-flash-loss", () => {
    expect(animationsCss).toContain(".animate-flash-loss");
    expect(animationsCss).toContain("flash-loss 500ms ease-out");
  });

  it("defines .animate-fade-in", () => {
    expect(animationsCss).toContain(".animate-fade-in");
  });

  it("defines .animate-fade-out", () => {
    expect(animationsCss).toContain(".animate-fade-out");
  });

  it("defines .animate-slide-in-top", () => {
    expect(animationsCss).toContain(".animate-slide-in-top");
  });

  it("defines .animate-slide-in-bottom", () => {
    expect(animationsCss).toContain(".animate-slide-in-bottom");
  });

  it("defines .animate-scale-in", () => {
    expect(animationsCss).toContain(".animate-scale-in");
  });

  it("defines .animate-bounce", () => {
    expect(animationsCss).toContain(".animate-bounce");
  });

  it("defines .animate-checkmark", () => {
    expect(animationsCss).toContain(".animate-checkmark");
  });
});

// ============================================
// Duration Utility Classes Tests
// ============================================

describe("Duration Utility Classes", () => {
  it("defines .duration-instant", () => {
    expect(animationsCss).toContain(".duration-instant");
  });

  it("defines .duration-fast", () => {
    expect(animationsCss).toContain(".duration-fast");
  });

  it("defines .duration-normal", () => {
    expect(animationsCss).toContain(".duration-normal");
  });

  it("defines .duration-slow", () => {
    expect(animationsCss).toContain(".duration-slow");
  });

  it("defines .duration-slower", () => {
    expect(animationsCss).toContain(".duration-slower");
  });
});

// ============================================
// Easing Utility Classes Tests
// ============================================

describe("Easing Utility Classes", () => {
  it("defines .ease-out-custom", () => {
    expect(animationsCss).toContain(".ease-out-custom");
  });

  it("defines .ease-in-out-custom", () => {
    expect(animationsCss).toContain(".ease-in-out-custom");
  });

  it("defines .ease-spring", () => {
    expect(animationsCss).toContain(".ease-spring");
  });
});

// ============================================
// Reduced Motion Tests
// ============================================

describe("Reduced Motion Support", () => {
  it("includes prefers-reduced-motion media query", () => {
    expect(animationsCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("disables animations for reduced motion", () => {
    expect(animationsCss).toContain("animation: none");
  });

  it("disables animations on all elements for reduced motion", () => {
    expect(animationsCss).toContain("animation-duration: 0.01ms !important");
    expect(animationsCss).toContain("animation-iteration-count: 1 !important");
    expect(animationsCss).toContain("transition-duration: 0.01ms !important");
  });
});

// ============================================
// Animation State Modifiers Tests
// ============================================

describe("Animation State Modifiers", () => {
  it("defines .animate-pause-on-hover", () => {
    expect(animationsCss).toContain(".animate-pause-on-hover:hover");
    expect(animationsCss).toContain("animation-play-state: paused");
  });

  it("defines .animate-once", () => {
    expect(animationsCss).toContain(".animate-once");
    expect(animationsCss).toContain("animation-iteration-count: 1");
  });

  it("defines animation fill mode utilities", () => {
    expect(animationsCss).toContain(".animate-fill-forwards");
    expect(animationsCss).toContain(".animate-fill-backwards");
    expect(animationsCss).toContain(".animate-fill-both");
  });

  it("defines animation delay utilities", () => {
    expect(animationsCss).toContain(".animate-delay-100");
    expect(animationsCss).toContain(".animate-delay-200");
    expect(animationsCss).toContain(".animate-delay-300");
    expect(animationsCss).toContain(".animate-delay-500");
    expect(animationsCss).toContain(".animate-delay-700");
    expect(animationsCss).toContain(".animate-delay-1000");
  });
});

// ============================================
// Tailwind Config Tests
// ============================================

describe("Tailwind Configuration", () => {
  describe("Duration tokens", () => {
    it("defines instant duration", () => {
      expect(tailwindConfig).toContain('instant: "100ms"');
    });

    it("defines fast duration", () => {
      expect(tailwindConfig).toContain('fast: "150ms"');
    });

    it("defines normal duration", () => {
      expect(tailwindConfig).toContain('normal: "250ms"');
    });

    it("defines slow duration", () => {
      expect(tailwindConfig).toContain('slow: "400ms"');
    });

    it("defines slower duration", () => {
      expect(tailwindConfig).toContain('slower: "600ms"');
    });
  });

  describe("Easing tokens", () => {
    it("defines out-expo easing", () => {
      expect(tailwindConfig).toContain('"out-expo"');
      expect(tailwindConfig).toContain("cubic-bezier(0.16, 1, 0.3, 1)");
    });

    it("defines in-out-expo easing", () => {
      expect(tailwindConfig).toContain('"in-out-expo"');
      expect(tailwindConfig).toContain("cubic-bezier(0.65, 0, 0.35, 1)");
    });

    it("defines spring easing", () => {
      expect(tailwindConfig).toContain("spring:");
      expect(tailwindConfig).toContain("cubic-bezier(0.34, 1.56, 0.64, 1)");
    });
  });

  describe("Keyframes", () => {
    it("defines shimmer keyframes", () => {
      expect(tailwindConfig).toContain("shimmer:");
      expect(tailwindConfig).toContain('backgroundPosition: "-200% 0"');
    });

    it("defines pulse keyframes", () => {
      expect(tailwindConfig).toContain("pulse:");
    });

    it("defines spin keyframes", () => {
      expect(tailwindConfig).toContain("spin:");
    });

    it("defines flash-profit keyframes", () => {
      expect(tailwindConfig).toContain('"flash-profit":');
    });

    it("defines flash-loss keyframes", () => {
      expect(tailwindConfig).toContain('"flash-loss":');
    });

    it("defines fade-in keyframes", () => {
      expect(tailwindConfig).toContain('"fade-in":');
    });

    it("defines slide-in keyframes", () => {
      expect(tailwindConfig).toContain('"slide-in-top":');
      expect(tailwindConfig).toContain('"slide-in-bottom":');
      expect(tailwindConfig).toContain('"slide-in-left":');
      expect(tailwindConfig).toContain('"slide-in-right":');
    });

    it("defines scale-in keyframes", () => {
      expect(tailwindConfig).toContain('"scale-in":');
    });

    it("defines checkmark-draw keyframes", () => {
      expect(tailwindConfig).toContain('"checkmark-draw":');
    });
  });

  describe("Animation utilities", () => {
    it("defines shimmer animation", () => {
      expect(tailwindConfig).toContain('shimmer: "shimmer 1.5s infinite"');
    });

    it("defines pulse-slow animation", () => {
      expect(tailwindConfig).toContain('"pulse-slow":');
    });

    it("defines spin variants", () => {
      expect(tailwindConfig).toContain('"spin-slow":');
      expect(tailwindConfig).toContain('"spin-fast":');
    });

    it("defines flash animations", () => {
      expect(tailwindConfig).toContain('"flash-profit":');
      expect(tailwindConfig).toContain('"flash-loss":');
    });

    it("defines fade animations", () => {
      expect(tailwindConfig).toContain('"fade-in":');
      expect(tailwindConfig).toContain('"fade-out":');
    });

    it("defines slide animations", () => {
      expect(tailwindConfig).toContain('"slide-in-top":');
      expect(tailwindConfig).toContain('"slide-in-bottom":');
    });

    it("defines scale animations", () => {
      expect(tailwindConfig).toContain('"scale-in":');
      expect(tailwindConfig).toContain('"scale-out":');
    });

    it("defines checkmark animation", () => {
      expect(tailwindConfig).toContain("checkmark:");
    });
  });

  describe("Animation delays", () => {
    it("defines delay tokens", () => {
      expect(tailwindConfig).toContain('"100": "100ms"');
      expect(tailwindConfig).toContain('"200": "200ms"');
      expect(tailwindConfig).toContain('"500": "500ms"');
      expect(tailwindConfig).toContain('"1000": "1000ms"');
    });
  });

  describe("Colors", () => {
    it("defines profit color", () => {
      expect(tailwindConfig).toContain("profit:");
      expect(tailwindConfig).toContain("#22C55E");
    });

    it("defines loss color", () => {
      expect(tailwindConfig).toContain("loss:");
      expect(tailwindConfig).toContain("#EF4444");
    });
  });
});

// ============================================
// File Structure Tests
// ============================================

describe("File Structure", () => {
  it("animations.css exists", () => {
    expect(animationsCss.length).toBeGreaterThan(0);
  });

  it("tailwind.config.ts exists", () => {
    expect(tailwindConfig.length).toBeGreaterThan(0);
  });

  it("tailwind.config.ts exports Config type", () => {
    expect(tailwindConfig).toContain('import type { Config } from "tailwindcss"');
    expect(tailwindConfig).toContain("const config: Config");
    expect(tailwindConfig).toContain("export default config");
  });
});
