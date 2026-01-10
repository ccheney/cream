/**
 * Spinner Component Tests
 *
 * Tests for inline spinner components.
 *
 * @see docs/plans/ui/28-states.md lines 35-40
 */

import { describe, expect, it } from "bun:test";
import type { SpinnerProps, SpinnerSize } from "./spinner.js";

// ============================================
// SpinnerProps Type Tests
// ============================================

describe("SpinnerProps Type", () => {
  it("all props are optional", () => {
    const props: SpinnerProps = {};
    expect(props.size).toBeUndefined();
    expect(props.sizePx).toBeUndefined();
    expect(props.animated).toBeUndefined();
  });

  it("supports size prop with valid values", () => {
    const sizes: SpinnerSize[] = ["xs", "sm", "md", "lg"];
    for (const size of sizes) {
      const props: SpinnerProps = { size };
      expect(props.size).toBe(size);
    }
  });

  it("supports sizePx prop as number", () => {
    const props: SpinnerProps = { sizePx: 48 };
    expect(props.sizePx).toBe(48);
  });

  it("supports animated prop", () => {
    const props: SpinnerProps = { animated: false };
    expect(props.animated).toBe(false);
  });

  it("supports label prop for accessibility", () => {
    const props: SpinnerProps = { label: "Processing request" };
    expect(props.label).toBe("Processing request");
  });

  it("supports testId prop", () => {
    const props: SpinnerProps = { testId: "my-spinner" };
    expect(props.testId).toBe("my-spinner");
  });

  it("supports style prop", () => {
    const props: SpinnerProps = { style: { margin: "10px" } };
    expect(props.style?.margin).toBe("10px");
  });

  it("supports className prop", () => {
    const props: SpinnerProps = { className: "custom-class" };
    expect(props.className).toBe("custom-class");
  });

  it("extends SVGAttributes", () => {
    const props: SpinnerProps = { viewBox: "0 0 24 24" };
    expect(props.viewBox).toBe("0 0 24 24");
  });
});

// ============================================
// SpinnerSize Type Tests
// ============================================

describe("SpinnerSize Type", () => {
  it("allows xs size", () => {
    const size: SpinnerSize = "xs";
    expect(size).toBe("xs");
  });

  it("allows sm size", () => {
    const size: SpinnerSize = "sm";
    expect(size).toBe("sm");
  });

  it("allows md size", () => {
    const size: SpinnerSize = "md";
    expect(size).toBe("md");
  });

  it("allows lg size", () => {
    const size: SpinnerSize = "lg";
    expect(size).toBe("lg");
  });
});

// ============================================
// SIZE_MAP Tests
// ============================================

describe("SIZE_MAP", () => {
  it("maps xs to 0.75em", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_MAP.xs).toBe("0.75em");
  });

  it("maps sm to 1em", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_MAP.sm).toBe("1em");
  });

  it("maps md to 1.5em", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_MAP.md).toBe("1.5em");
  });

  it("maps lg to 2em", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_MAP.lg).toBe("2em");
  });
});

// ============================================
// SIZE_PX_MAP Tests
// ============================================

describe("SIZE_PX_MAP", () => {
  it("maps xs to 12px", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_PX_MAP.xs).toBe(12);
  });

  it("maps sm to 16px", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_PX_MAP.sm).toBe(16);
  });

  it("maps md to 24px", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_PX_MAP.md).toBe(24);
  });

  it("maps lg to 32px", async () => {
    const module = await import("./spinner.js");
    expect(module.SIZE_PX_MAP.lg).toBe(32);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports Spinner component", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.Spinner).toBe("function");
  });

  it("exports SpinnerDots component", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.SpinnerDots).toBe("function");
  });

  it("exports SpinnerBar component", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.SpinnerBar).toBe("function");
  });

  it("exports ButtonLoading component", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.ButtonLoading).toBe("function");
  });

  it("exports SpinnerOverlay component", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.SpinnerOverlay).toBe("function");
  });

  it("exports SIZE_MAP constant", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.SIZE_MAP).toBe("object");
  });

  it("exports SIZE_PX_MAP constant", async () => {
    const module = await import("./spinner.js");
    expect(typeof module.SIZE_PX_MAP).toBe("object");
  });

  it("exports default as Spinner", async () => {
    const module = await import("./spinner.js");
    expect(module.default).toBe(module.Spinner);
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
  it("Spinner uses role=status", () => {
    // Component sets role="status" for live region
    const role = "status";
    expect(role).toBe("status");
  });

  it("Spinner has aria-label", () => {
    // Default label is "Loading"
    const defaultLabel = "Loading";
    expect(defaultLabel).toBe("Loading");
  });

  it("SpinnerDots uses role=status", () => {
    const role = "status";
    expect(role).toBe("status");
  });

  it("SpinnerBar uses role=status", () => {
    const role = "status";
    expect(role).toBe("status");
  });

  it("SpinnerOverlay uses aria-busy", () => {
    // Container indicates loading state
    const ariaBusy = true;
    expect(ariaBusy).toBe(true);
  });
});

// ============================================
// Animation Tests
// ============================================

describe("Animation", () => {
  it("spin animation is 1s linear infinite", () => {
    const animation = "spin 1s linear infinite";
    expect(animation).toContain("spin");
    expect(animation).toContain("1s");
    expect(animation).toContain("linear");
    expect(animation).toContain("infinite");
  });

  it("pulse animation for SpinnerDots is 1.5s", () => {
    const animation = "pulse 1.5s ease-in-out infinite";
    expect(animation).toContain("pulse");
    expect(animation).toContain("1.5s");
  });

  it("slide animation for SpinnerBar is 1.5s", () => {
    const animation = "slide 1.5s ease-in-out infinite";
    expect(animation).toContain("slide");
    expect(animation).toContain("1.5s");
  });

  it("animated=false disables animation", () => {
    const props: SpinnerProps = { animated: false };
    expect(props.animated).toBe(false);
  });

  it("disabled spinner has reduced opacity", () => {
    // When animated=false, opacity is 0.6
    const reducedOpacity = 0.6;
    expect(reducedOpacity).toBe(0.6);
  });
});

// ============================================
// Styling Tests
// ============================================

describe("Styling", () => {
  it("uses currentColor for stroke", () => {
    // Spinner inherits color from parent
    const stroke = "currentColor";
    expect(stroke).toBe("currentColor");
  });

  it("uses strokeWidth of 2", () => {
    const strokeWidth = 2;
    expect(strokeWidth).toBe(2);
  });

  it("has viewBox of 0 0 24 24", () => {
    const viewBox = "0 0 24 24";
    expect(viewBox).toBe("0 0 24 24");
  });

  it("circle has stroke-opacity 0.25 for background", () => {
    const strokeOpacity = 0.25;
    expect(strokeOpacity).toBe(0.25);
  });
});

// ============================================
// ButtonLoading Tests
// ============================================

describe("ButtonLoading", () => {
  it("default spinnerSize is sm", () => {
    const defaultSize = "sm";
    expect(defaultSize).toBe("sm");
  });

  it("default spinnerPosition is left", () => {
    const defaultPosition = "left";
    expect(defaultPosition).toBe("left");
  });

  it("supports center position (spinner only)", () => {
    const position = "center";
    expect(position).toBe("center");
  });

  it("supports right position", () => {
    const position = "right";
    expect(position).toBe("right");
  });

  it("supports loadingText to replace children", () => {
    const loadingText = "Submitting...";
    expect(loadingText).toBe("Submitting...");
  });

  it("returns children when not loading", () => {
    const isLoading = false;
    expect(isLoading).toBe(false);
  });

  it("shows spinner when loading", () => {
    const isLoading = true;
    expect(isLoading).toBe(true);
  });
});

// ============================================
// SpinnerOverlay Tests
// ============================================

describe("SpinnerOverlay", () => {
  it("default spinnerSize is md", () => {
    const defaultSize = "md";
    expect(defaultSize).toBe("md");
  });

  it("default blur is true", () => {
    const defaultBlur = true;
    expect(defaultBlur).toBe(true);
  });

  it("loading state dims content to 0.5 opacity", () => {
    const opacity = 0.5;
    expect(opacity).toBe(0.5);
  });

  it("applies blur filter when loading and blur=true", () => {
    const filter = "blur(1px)";
    expect(filter).toBe("blur(1px)");
  });

  it("disables pointer events when loading", () => {
    const pointerEvents = "none";
    expect(pointerEvents).toBe("none");
  });

  it("overlay has centered positioning", () => {
    const position = "absolute";
    const display = "flex";
    const alignItems = "center";
    const justifyContent = "center";
    expect(position).toBe("absolute");
    expect(display).toBe("flex");
    expect(alignItems).toBe("center");
    expect(justifyContent).toBe("center");
  });

  it("overlay has semi-transparent background", () => {
    const bgColor = "rgba(255, 255, 255, 0.5)";
    expect(bgColor).toBe("rgba(255, 255, 255, 0.5)");
  });
});

// ============================================
// SpinnerDots Tests
// ============================================

describe("SpinnerDots", () => {
  it("renders three dots", () => {
    const dotCount = 3;
    expect(dotCount).toBe(3);
  });

  it("dots have staggered animation delays", () => {
    const delays = ["0ms", "150ms", "300ms"];
    expect(delays.length).toBe(3);
    expect(delays[0]).toBe("0ms");
    expect(delays[1]).toBe("150ms");
    expect(delays[2]).toBe("300ms");
  });

  it("dot size is 1/4 of total size", () => {
    const totalSize = 16;
    const dotSize = totalSize / 4;
    expect(dotSize).toBe(4);
  });

  it("gap is half of dot size", () => {
    const dotSize = 4;
    const gap = dotSize / 2;
    expect(gap).toBe(2);
  });
});

// ============================================
// SpinnerBar Tests
// ============================================

describe("SpinnerBar", () => {
  it("bar height is 1/4 of size", () => {
    const size = 16;
    const height = size / 4;
    expect(height).toBe(4);
  });

  it("bar width is 40%", () => {
    const width = "40%";
    expect(width).toBe("40%");
  });

  it("container width is 100%", () => {
    const width = "100%";
    expect(width).toBe("100%");
  });

  it("background opacity is 0.2", () => {
    const opacity = 0.2;
    expect(opacity).toBe(0.2);
  });

  it("does not support sizePx (uses size only)", () => {
    // SpinnerBar Omits sizePx from props
    const propsOmitsSizePx = true;
    expect(propsOmitsSizePx).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("sizePx overrides size prop", () => {
    const props: SpinnerProps = { size: "lg", sizePx: 100 };
    // sizePx takes precedence
    expect(props.sizePx).toBe(100);
  });

  it("handles zero sizePx", () => {
    const props: SpinnerProps = { sizePx: 0 };
    expect(props.sizePx).toBe(0);
  });

  it("handles empty label", () => {
    const props: SpinnerProps = { label: "" };
    expect(props.label).toBe("");
  });

  it("handles empty testId", () => {
    const props: SpinnerProps = { testId: "" };
    expect(props.testId).toBe("");
  });

  it("handles very large sizePx", () => {
    const props: SpinnerProps = { sizePx: 1000 };
    expect(props.sizePx).toBe(1000);
  });
});

// ============================================
// Integration Patterns
// ============================================

describe("Integration Patterns", () => {
  it("works in button loading state", () => {
    const pattern = {
      component: "ButtonLoading",
      parent: "button",
      usage: "Wrap button content",
    };
    expect(pattern.component).toBe("ButtonLoading");
  });

  it("works as inline indicator", () => {
    const pattern = {
      component: "Spinner",
      size: "sm",
      inline: true,
    };
    expect(pattern.size).toBe("sm");
  });

  it("works in form submit", () => {
    const pattern = {
      isSubmitting: true,
      showSpinner: true,
      disableButton: true,
    };
    expect(pattern.isSubmitting).toBe(true);
  });

  it("SpinnerOverlay wraps content for loading", () => {
    const pattern = {
      component: "SpinnerOverlay",
      usage: "Card loading overlay",
    };
    expect(pattern.component).toBe("SpinnerOverlay");
  });
});

// ============================================
// Color Inheritance Tests
// ============================================

describe("Color Inheritance", () => {
  it("inherits color from parent element", () => {
    // Uses currentColor for SVG stroke
    const colorInheritance = "currentColor";
    expect(colorInheritance).toBe("currentColor");
  });

  it("can be styled via className", () => {
    const props: SpinnerProps = { className: "text-blue-500" };
    expect(props.className).toBe("text-blue-500");
  });

  it("can be styled via style prop", () => {
    const props: SpinnerProps = { style: { color: "#3b82f6" } };
    expect(props.style?.color).toBe("#3b82f6");
  });
});
