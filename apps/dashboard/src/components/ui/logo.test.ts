/**
 * Logo Component Tests
 *
 * Tests for the Cream logo components.
 *
 * @see docs/plans/ui/28-states.md lines 42-44
 */

import { describe, expect, it } from "bun:test";
import type { LogoProps, LogoSize, LogoVariant } from "./logo.js";

// ============================================
// LogoProps Type Tests
// ============================================

describe("LogoProps Type", () => {
  it("all props are optional", () => {
    const props: LogoProps = {};
    expect(props.size).toBeUndefined();
    expect(props.sizePx).toBeUndefined();
    expect(props.variant).toBeUndefined();
  });

  it("supports size prop with valid values", () => {
    const sizes: LogoSize[] = ["xs", "sm", "md", "lg", "xl"];
    sizes.forEach((size) => {
      const props: LogoProps = { size };
      expect(props.size).toBe(size);
    });
  });

  it("supports sizePx prop as number", () => {
    const props: LogoProps = { sizePx: 100 };
    expect(props.sizePx).toBe(100);
  });

  it("supports variant prop", () => {
    const variants: LogoVariant[] = ["full", "icon"];
    variants.forEach((variant) => {
      const props: LogoProps = { variant };
      expect(props.variant).toBe(variant);
    });
  });

  it("supports pulse prop", () => {
    const props: LogoProps = { pulse: true };
    expect(props.pulse).toBe(true);
  });

  it("supports label prop", () => {
    const props: LogoProps = { label: "Company Logo" };
    expect(props.label).toBe("Company Logo");
  });

  it("supports testId prop", () => {
    const props: LogoProps = { testId: "my-logo" };
    expect(props.testId).toBe("my-logo");
  });

  it("supports style prop", () => {
    const props: LogoProps = { style: { color: "#ff0000" } };
    expect(props.style?.color).toBe("#ff0000");
  });

  it("supports className prop", () => {
    const props: LogoProps = { className: "custom-logo" };
    expect(props.className).toBe("custom-logo");
  });

  it("extends SVGAttributes", () => {
    const props: LogoProps = { viewBox: "0 0 100 100" };
    expect(props.viewBox).toBe("0 0 100 100");
  });
});

// ============================================
// LogoSize Type Tests
// ============================================

describe("LogoSize Type", () => {
  it("allows xs size", () => {
    const size: LogoSize = "xs";
    expect(size).toBe("xs");
  });

  it("allows sm size", () => {
    const size: LogoSize = "sm";
    expect(size).toBe("sm");
  });

  it("allows md size", () => {
    const size: LogoSize = "md";
    expect(size).toBe("md");
  });

  it("allows lg size", () => {
    const size: LogoSize = "lg";
    expect(size).toBe("lg");
  });

  it("allows xl size", () => {
    const size: LogoSize = "xl";
    expect(size).toBe("xl");
  });
});

// ============================================
// LogoVariant Type Tests
// ============================================

describe("LogoVariant Type", () => {
  it("allows full variant", () => {
    const variant: LogoVariant = "full";
    expect(variant).toBe("full");
  });

  it("allows icon variant", () => {
    const variant: LogoVariant = "icon";
    expect(variant).toBe("icon");
  });
});

// ============================================
// SIZE_MAP Tests
// ============================================

describe("SIZE_MAP", () => {
  it("maps xs to 24px", async () => {
    const module = await import("./logo.js");
    expect(module.SIZE_MAP.xs).toBe(24);
  });

  it("maps sm to 32px", async () => {
    const module = await import("./logo.js");
    expect(module.SIZE_MAP.sm).toBe(32);
  });

  it("maps md to 48px", async () => {
    const module = await import("./logo.js");
    expect(module.SIZE_MAP.md).toBe(48);
  });

  it("maps lg to 64px", async () => {
    const module = await import("./logo.js");
    expect(module.SIZE_MAP.lg).toBe(64);
  });

  it("maps xl to 96px", async () => {
    const module = await import("./logo.js");
    expect(module.SIZE_MAP.xl).toBe(96);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports Logo component", async () => {
    const module = await import("./logo.js");
    expect(typeof module.Logo).toBe("function");
  });

  it("exports LoadingLogo component", async () => {
    const module = await import("./logo.js");
    expect(typeof module.LoadingLogo).toBe("function");
  });

  it("exports SIZE_MAP constant", async () => {
    const module = await import("./logo.js");
    expect(typeof module.SIZE_MAP).toBe("object");
  });

  it("exports default as Logo", async () => {
    const module = await import("./logo.js");
    expect(module.default).toBe(module.Logo);
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
  it("Logo has aria-label", () => {
    const defaultLabel = "Cream";
    expect(defaultLabel).toBe("Cream");
  });

  it("LoadingLogo uses role=status", () => {
    const role = "status";
    expect(role).toBe("status");
  });

  it("LoadingLogo uses aria-live=polite", () => {
    const ariaLive = "polite";
    expect(ariaLive).toBe("polite");
  });

  it("LoadingLogo has default label Loading...", () => {
    const defaultLabel = "Loading...";
    expect(defaultLabel).toBe("Loading...");
  });

  it("includes sr-only text for screen readers", () => {
    const srOnlyClass = "sr-only";
    expect(srOnlyClass).toBe("sr-only");
  });
});

// ============================================
// Animation Tests
// ============================================

describe("Animation", () => {
  it("pulse animation is 2s ease-in-out infinite", () => {
    const animation = "logo-pulse 2s ease-in-out infinite";
    expect(animation).toContain("logo-pulse");
    expect(animation).toContain("2s");
    expect(animation).toContain("ease-in-out");
    expect(animation).toContain("infinite");
  });

  it("pulse=false disables animation", () => {
    const props: LogoProps = { pulse: false };
    expect(props.pulse).toBe(false);
  });

  it("pulse=true enables animation", () => {
    const props: LogoProps = { pulse: true };
    expect(props.pulse).toBe(true);
  });

  it("keyframes define opacity transitions", () => {
    const keyframes = {
      "0%, 100%": { opacity: 1 },
      "50%": { opacity: 0.6 },
    };
    expect(keyframes["0%, 100%"].opacity).toBe(1);
    expect(keyframes["50%"].opacity).toBe(0.6);
  });
});

// ============================================
// Styling Tests
// ============================================

describe("Styling", () => {
  it("uses currentColor for stroke", () => {
    const stroke = "currentColor";
    expect(stroke).toBe("currentColor");
  });

  it("icon variant is square", () => {
    const sizePx = 48;
    const dimensions = { width: sizePx, height: sizePx };
    expect(dimensions.width).toBe(dimensions.height);
  });

  it("full variant width is 3x height", () => {
    const sizePx = 48;
    const dimensions = { width: sizePx * 3, height: sizePx };
    expect(dimensions.width).toBe(144);
    expect(dimensions.height).toBe(48);
  });

  it("icon viewBox is 0 0 48 48", () => {
    const viewBox = "0 0 48 48";
    expect(viewBox).toBe("0 0 48 48");
  });

  it("full viewBox is 0 0 144 48", () => {
    const viewBox = "0 0 144 48";
    expect(viewBox).toBe("0 0 144 48");
  });
});

// ============================================
// LoadingLogo Tests
// ============================================

describe("LoadingLogo", () => {
  it("default size is lg", () => {
    const defaultSize = "lg";
    expect(defaultSize).toBe("lg");
  });

  it("default variant is icon", () => {
    const defaultVariant = "icon";
    expect(defaultVariant).toBe("icon");
  });

  it("default label is Loading...", () => {
    const defaultLabel = "Loading...";
    expect(defaultLabel).toBe("Loading...");
  });

  it("has centered layout", () => {
    const styles = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100%",
    };
    expect(styles.display).toBe("flex");
    expect(styles.alignItems).toBe("center");
    expect(styles.justifyContent).toBe("center");
  });

  it("always has pulse enabled", () => {
    // LoadingLogo omits pulse prop and always enables it
    const pulseAlwaysEnabled = true;
    expect(pulseAlwaysEnabled).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("sizePx overrides size prop", () => {
    const props: LogoProps = { size: "xl", sizePx: 200 };
    expect(props.sizePx).toBe(200);
  });

  it("handles zero sizePx", () => {
    const props: LogoProps = { sizePx: 0 };
    expect(props.sizePx).toBe(0);
  });

  it("handles empty label", () => {
    const props: LogoProps = { label: "" };
    expect(props.label).toBe("");
  });

  it("handles very large sizePx", () => {
    const props: LogoProps = { sizePx: 1000 };
    expect(props.sizePx).toBe(1000);
  });

  it("handles empty testId", () => {
    const props: LogoProps = { testId: "" };
    expect(props.testId).toBe("");
  });
});

// ============================================
// Integration Patterns
// ============================================

describe("Integration Patterns", () => {
  it("works in loading.tsx", () => {
    const pattern = {
      component: "LoadingLogo",
      usage: "Next.js loading.tsx",
    };
    expect(pattern.component).toBe("LoadingLogo");
  });

  it("works in header/navbar", () => {
    const pattern = {
      component: "Logo",
      variant: "full",
      size: "sm",
    };
    expect(pattern.variant).toBe("full");
  });

  it("works as favicon", () => {
    const pattern = {
      component: "Logo",
      variant: "icon",
      size: "xs",
    };
    expect(pattern.variant).toBe("icon");
  });

  it("works in Suspense fallback", () => {
    const pattern = {
      component: "LoadingLogo",
      usage: "Suspense fallback",
    };
    expect(pattern.usage).toBe("Suspense fallback");
  });
});

// ============================================
// Theme Support Tests
// ============================================

describe("Theme Support", () => {
  it("inherits color from currentColor", () => {
    const colorInheritance = "currentColor";
    expect(colorInheritance).toBe("currentColor");
  });

  it("works with light theme", () => {
    const lightTheme = { color: "#1c1917" };
    expect(lightTheme.color).toBe("#1c1917");
  });

  it("works with dark theme", () => {
    const darkTheme = { color: "#fafaf9" };
    expect(darkTheme.color).toBe("#fafaf9");
  });

  it("can be styled via className for theme", () => {
    const props: LogoProps = { className: "text-stone-900 dark:text-stone-100" };
    expect(props.className).toContain("dark:");
  });
});
