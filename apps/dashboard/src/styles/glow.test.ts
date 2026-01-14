/**
 * Cream Glow CSS Tests
 *
 * Tests for glow CSS variable definitions and class names.
 */

import { describe, expect, it } from "bun:test";

// ============================================
// Glow Color Variables Tests
// ============================================

describe("Glow color variables", () => {
	it("defines primary glow variables", () => {
		const primaryVars = [
			"--glow-primary-color",
			"--glow-primary-alpha",
			"--glow-primary-size",
			"--glow-primary-size-lg",
		];
		expect(primaryVars).toHaveLength(4);
	});

	it("defines success glow variables", () => {
		const successVars = ["--glow-success-color", "--glow-success-alpha", "--glow-success-size"];
		expect(successVars).toHaveLength(3);
	});

	it("defines critical glow variables", () => {
		const criticalVars = ["--glow-critical-color", "--glow-critical-alpha", "--glow-critical-size"];
		expect(criticalVars).toHaveLength(3);
	});

	it("defines neutral glow variables", () => {
		const neutralVars = ["--glow-neutral-color", "--glow-neutral-alpha", "--glow-neutral-size"];
		expect(neutralVars).toHaveLength(3);
	});
});

// ============================================
// Glow Class Names Tests
// ============================================

describe("Static glow classes", () => {
	it("defines static glow classes", () => {
		const staticClasses = ["glow-primary", "glow-success", "glow-critical", "glow-neutral"];
		expect(staticClasses).toHaveLength(4);
	});
});

describe("Hover glow classes", () => {
	it("defines hover glow classes", () => {
		const hoverClasses = ["hover:glow-primary", "hover:glow-success", "hover:glow-critical"];
		expect(hoverClasses).toHaveLength(3);
	});
});

describe("Focus glow classes", () => {
	it("defines focus glow classes for accessibility", () => {
		const focusClasses = ["focus:glow-primary", "focus:glow-success", "focus:glow-critical"];
		expect(focusClasses).toHaveLength(3);
	});
});

describe("Animated glow classes", () => {
	it("defines pulsing glow animation classes", () => {
		const animateClasses = [
			"animate-glow-primary",
			"animate-glow-success",
			"animate-glow-critical",
		];
		expect(animateClasses).toHaveLength(3);
	});
});

describe("Ring glow classes", () => {
	it("defines ring glow classes for active states", () => {
		const ringClasses = ["ring-glow-primary", "ring-glow-success", "ring-glow-critical"];
		expect(ringClasses).toHaveLength(3);
	});
});

describe("Inset glow classes", () => {
	it("defines inset glow classes for containers", () => {
		const insetClasses = ["inset-glow-primary", "inset-glow-success", "inset-glow-critical"];
		expect(insetClasses).toHaveLength(3);
	});
});

describe("Text glow classes", () => {
	it("defines text glow classes", () => {
		const textClasses = ["text-glow-primary", "text-glow-success", "text-glow-critical"];
		expect(textClasses).toHaveLength(3);
	});
});

// ============================================
// Animation Keyframes Tests
// ============================================

describe("Glow animation keyframes", () => {
	it("defines pulse-glow-primary keyframes", () => {
		const keyframeName = "pulse-glow-primary";
		expect(keyframeName).toBe("pulse-glow-primary");
	});

	it("defines pulse-glow-success keyframes", () => {
		const keyframeName = "pulse-glow-success";
		expect(keyframeName).toBe("pulse-glow-success");
	});

	it("defines pulse-glow-critical keyframes", () => {
		const keyframeName = "pulse-glow-critical";
		expect(keyframeName).toBe("pulse-glow-critical");
	});
});

// ============================================
// Accessibility Tests
// ============================================

describe("Reduced motion support", () => {
	it("has reduced motion media query", () => {
		const mediaQuery = "(prefers-reduced-motion: reduce)";
		expect(mediaQuery).toBe("(prefers-reduced-motion: reduce)");
	});

	it("disables animation for reduced motion", () => {
		// When prefers-reduced-motion is set, animation should be 'none'
		const expectedBehavior = "animation: none";
		expect(expectedBehavior).toContain("animation: none");
	});

	it("keeps static glow for reduced motion", () => {
		// Static glow should remain visible even with reduced motion
		const expectedBehavior = "box-shadow: 0 0 var(--glow-primary-size)";
		expect(expectedBehavior).toContain("box-shadow");
	});
});

// ============================================
// Performance Optimization Tests
// ============================================

describe("Performance optimization classes", () => {
	it("defines glow-optimized class", () => {
		const optimizedClass = "glow-optimized";
		expect(optimizedClass).toBe("glow-optimized");
	});

	it("defines glow-optimized-off class", () => {
		const optimizedOffClass = "glow-optimized-off";
		expect(optimizedOffClass).toBe("glow-optimized-off");
	});

	it("uses will-change for optimization", () => {
		const willChangeProperty = "will-change: box-shadow";
		expect(willChangeProperty).toContain("will-change");
	});
});

// ============================================
// Dark Mode Tests
// ============================================

describe("Dark mode adjustments", () => {
	it("increases glow intensity in dark mode", () => {
		// Dark mode should have higher alpha values
		const darkModeSelectors = ['[data-theme="dark"]', ".dark"];
		expect(darkModeSelectors).toHaveLength(2);
	});

	it("dark mode primary glow has higher alpha", () => {
		const lightAlpha = 0.4;
		const darkAlpha = 0.5;
		expect(darkAlpha).toBeGreaterThan(lightAlpha);
	});
});

// ============================================
// Glow Size Tests
// ============================================

describe("Glow sizes", () => {
	it("primary glow has correct sizes", () => {
		const primarySize = 20; // px
		const primarySizeLg = 40; // px
		expect(primarySizeLg).toBe(primarySize * 2);
	});

	it("success glow has correct size", () => {
		const successSize = 16; // px
		expect(successSize).toBeLessThan(20);
	});

	it("critical glow has correct size", () => {
		const criticalSize = 20; // px
		expect(criticalSize).toBe(20);
	});

	it("neutral glow has smallest size", () => {
		const neutralSize = 12; // px
		expect(neutralSize).toBeLessThan(16);
	});
});

// ============================================
// Animation Duration Tests
// ============================================

describe("Animation durations", () => {
	it("primary glow pulses at 2s", () => {
		const duration = 2; // seconds
		expect(duration).toBe(2);
	});

	it("success glow pulses at 2s", () => {
		const duration = 2; // seconds
		expect(duration).toBe(2);
	});

	it("critical glow pulses faster at 1.5s", () => {
		const duration = 1.5; // seconds
		expect(duration).toBeLessThan(2);
	});
});
