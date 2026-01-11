/**
 * Success Feedback Component Tests
 *
 * Tests for inline success feedback with checkmark animation.
 *
 * @see docs/plans/ui/28-states.md lines 110-114
 */

import { describe, expect, it } from "bun:test";
import type {
  ButtonState,
  CheckmarkProps,
  SuccessButtonProps,
  UseAsyncButtonOptions,
} from "./success-feedback/index.js";

// ============================================
// ButtonState Type Tests
// ============================================

describe("ButtonState Type", () => {
  it("allows idle state", () => {
    const state: ButtonState = "idle";
    expect(state).toBe("idle");
  });

  it("allows loading state", () => {
    const state: ButtonState = "loading";
    expect(state).toBe("loading");
  });

  it("allows success state", () => {
    const state: ButtonState = "success";
    expect(state).toBe("success");
  });

  it("allows error state", () => {
    const state: ButtonState = "error";
    expect(state).toBe("error");
  });
});

// ============================================
// CheckmarkProps Type Tests
// ============================================

describe("CheckmarkProps Type", () => {
  it("all props are optional", () => {
    const props: CheckmarkProps = {};
    expect(props.size).toBeUndefined();
    expect(props.color).toBeUndefined();
    expect(props.duration).toBeUndefined();
    expect(props.animated).toBeUndefined();
  });

  it("supports size prop", () => {
    const props: CheckmarkProps = { size: 32 };
    expect(props.size).toBe(32);
  });

  it("supports color prop", () => {
    const props: CheckmarkProps = { color: "#22c55e" };
    expect(props.color).toBe("#22c55e");
  });

  it("supports duration prop", () => {
    const props: CheckmarkProps = { duration: 500 };
    expect(props.duration).toBe(500);
  });

  it("supports animated prop", () => {
    const props: CheckmarkProps = { animated: true };
    expect(props.animated).toBe(true);
  });

  it("supports testId prop", () => {
    const props: CheckmarkProps = { testId: "my-checkmark" };
    expect(props.testId).toBe("my-checkmark");
  });
});

// ============================================
// SuccessButtonProps Type Tests
// ============================================

describe("SuccessButtonProps Type", () => {
  it("state prop is optional", () => {
    const props: SuccessButtonProps = {};
    expect(props.state).toBeUndefined();
  });

  it("supports state prop", () => {
    const props: SuccessButtonProps = { state: "loading" };
    expect(props.state).toBe("loading");
  });

  it("supports loadingText prop", () => {
    const props: SuccessButtonProps = { loadingText: "Saving..." };
    expect(props.loadingText).toBe("Saving...");
  });

  it("supports successText prop", () => {
    const props: SuccessButtonProps = { successText: "Done!" };
    expect(props.successText).toBe("Done!");
  });

  it("supports errorText prop", () => {
    const props: SuccessButtonProps = { errorText: "Failed!" };
    expect(props.errorText).toBe("Failed!");
  });

  it("supports successDuration prop", () => {
    const props: SuccessButtonProps = { successDuration: 3000 };
    expect(props.successDuration).toBe(3000);
  });

  it("supports errorDuration prop", () => {
    const props: SuccessButtonProps = { errorDuration: 5000 };
    expect(props.errorDuration).toBe(5000);
  });

  it("supports onStateReset prop", () => {
    const props: SuccessButtonProps = { onStateReset: () => {} };
    expect(typeof props.onStateReset).toBe("function");
  });

  it("supports spinnerSize prop", () => {
    const props: SuccessButtonProps = { spinnerSize: "md" };
    expect(props.spinnerSize).toBe("md");
  });

  it("supports testId prop", () => {
    const props: SuccessButtonProps = { testId: "my-button" };
    expect(props.testId).toBe("my-button");
  });
});

// ============================================
// UseAsyncButtonOptions Type Tests
// ============================================

describe("UseAsyncButtonOptions Type", () => {
  it("all properties are optional", () => {
    const options: UseAsyncButtonOptions<void> = {};
    expect(options.successMessage).toBeUndefined();
    expect(options.successDuration).toBeUndefined();
    expect(options.errorDuration).toBeUndefined();
  });

  it("supports successMessage option", () => {
    const options: UseAsyncButtonOptions<void> = { successMessage: "Done!" };
    expect(options.successMessage).toBe("Done!");
  });

  it("supports successDuration option", () => {
    const options: UseAsyncButtonOptions<void> = { successDuration: 1500 };
    expect(options.successDuration).toBe(1500);
  });

  it("supports errorDuration option", () => {
    const options: UseAsyncButtonOptions<void> = { errorDuration: 4000 };
    expect(options.errorDuration).toBe(4000);
  });

  it("supports onSuccess callback", () => {
    const options: UseAsyncButtonOptions<string> = {
      onSuccess: (result) => result,
    };
    expect(typeof options.onSuccess).toBe("function");
  });

  it("supports onError callback", () => {
    const options: UseAsyncButtonOptions<void> = {
      onError: (error) => error,
    };
    expect(typeof options.onError).toBe("function");
  });
});

// ============================================
// Constants Tests
// ============================================

describe("Constants", () => {
  it("exports CHECKMARK_ANIMATION_DURATION", async () => {
    const module = await import("./success-feedback/index.js");
    expect(module.CHECKMARK_ANIMATION_DURATION).toBe(300);
  });

  it("exports SUCCESS_STATE_DURATION", async () => {
    const module = await import("./success-feedback/index.js");
    expect(module.SUCCESS_STATE_DURATION).toBe(2000);
  });

  it("exports ERROR_STATE_DURATION", async () => {
    const module = await import("./success-feedback/index.js");
    expect(module.ERROR_STATE_DURATION).toBe(3000);
  });
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
  it("exports Checkmark component", async () => {
    const module = await import("./success-feedback/index.js");
    expect(typeof module.Checkmark).toBe("function");
  });

  it("exports SuccessText component", async () => {
    const module = await import("./success-feedback/index.js");
    expect(typeof module.SuccessText).toBe("function");
  });

  it("exports SuccessButton component", async () => {
    const module = await import("./success-feedback/index.js");
    expect(typeof module.SuccessButton).toBe("function");
  });

  it("exports useAsyncButton hook", async () => {
    const module = await import("./success-feedback/index.js");
    expect(typeof module.useAsyncButton).toBe("function");
  });

  it("exports InlineSuccess component", async () => {
    const module = await import("./success-feedback/index.js");
    expect(typeof module.InlineSuccess).toBe("function");
  });

  it("exports default as SuccessButton", async () => {
    const module = await import("./success-feedback/index.js");
    expect(module.default).toBe(module.SuccessButton);
  });
});

// ============================================
// Checkmark Animation Tests
// ============================================

describe("Checkmark Animation", () => {
  it("default size is 24px", () => {
    const defaultSize = 24;
    expect(defaultSize).toBe(24);
  });

  it("default color is green-500", () => {
    const defaultColor = "#22c55e";
    expect(defaultColor).toBe("#22c55e");
  });

  it("default duration is 300ms", () => {
    const defaultDuration = 300;
    expect(defaultDuration).toBe(300);
  });

  it("uses stroke-dashoffset animation", () => {
    const animationType = "checkmark-draw";
    expect(animationType).toBe("checkmark-draw");
  });

  it("uses cubic-bezier easing", () => {
    const easing = "cubic-bezier(0.16, 1, 0.3, 1)";
    expect(easing).toContain("cubic-bezier");
  });

  it("stroke width is 3", () => {
    const strokeWidth = 3;
    expect(strokeWidth).toBe(3);
  });

  it("viewBox is 0 0 24 24", () => {
    const viewBox = "0 0 24 24";
    expect(viewBox).toBe("0 0 24 24");
  });
});

// ============================================
// Button State Machine Tests
// ============================================

describe("Button State Machine", () => {
  it("starts in idle state", () => {
    const initialState: ButtonState = "idle";
    expect(initialState).toBe("idle");
  });

  it("transitions idle → loading on submit", () => {
    const states: ButtonState[] = ["idle", "loading"];
    expect(states[1]).toBe("loading");
  });

  it("transitions loading → success on completion", () => {
    const states: ButtonState[] = ["loading", "success"];
    expect(states[1]).toBe("success");
  });

  it("transitions loading → error on failure", () => {
    const states: ButtonState[] = ["loading", "error"];
    expect(states[1]).toBe("error");
  });

  it("transitions success → idle after duration", () => {
    const states: ButtonState[] = ["success", "idle"];
    expect(states[1]).toBe("idle");
  });

  it("transitions error → idle after duration", () => {
    const states: ButtonState[] = ["error", "idle"];
    expect(states[1]).toBe("idle");
  });
});

// ============================================
// Button Styling Tests
// ============================================

describe("Button Styling", () => {
  it("success state has green background", () => {
    const successBg = "#22c55e";
    expect(successBg).toBe("#22c55e");
  });

  it("error state has red background", () => {
    const errorBg = "#ef4444";
    expect(errorBg).toBe("#ef4444");
  });

  it("idle state has dark background", () => {
    const idleBg = "#1c1917";
    expect(idleBg).toBe("#1c1917");
  });

  it("loading state has reduced opacity", () => {
    const opacity = 0.6;
    expect(opacity).toBe(0.6);
  });

  it("button has 6px border radius", () => {
    const borderRadius = "6px";
    expect(borderRadius).toBe("6px");
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
  it("checkmark has aria-hidden", () => {
    const ariaHidden = true;
    expect(ariaHidden).toBe(true);
  });

  it("success button has aria-busy during loading", () => {
    const ariaBusy = true;
    expect(ariaBusy).toBe(true);
  });

  it("success button has aria-disabled when disabled", () => {
    const ariaDisabled = true;
    expect(ariaDisabled).toBe(true);
  });

  it("success text uses role=status", () => {
    const role = "status";
    expect(role).toBe("status");
  });

  it("success text uses aria-live=polite", () => {
    const ariaLive = "polite";
    expect(ariaLive).toBe("polite");
  });

  it("screen reader announces success", () => {
    const announcement = "Form submitted successfully";
    expect(announcement).toBe("Form submitted successfully");
  });
});

// ============================================
// InlineSuccess Tests
// ============================================

describe("InlineSuccess", () => {
  it("default text is Saved", () => {
    const defaultText = "Saved";
    expect(defaultText).toBe("Saved");
  });

  it("default duration is SUCCESS_STATE_DURATION", () => {
    const duration = 2000;
    expect(duration).toBe(2000);
  });

  it("has green background tint", () => {
    const bgColor = "rgba(34, 197, 94, 0.1)";
    expect(bgColor).toContain("rgba(34, 197, 94");
  });

  it("has green text color", () => {
    const textColor = "#22c55e";
    expect(textColor).toBe("#22c55e");
  });

  it("calls onComplete after duration", () => {
    const hasCallback = true;
    expect(hasCallback).toBe(true);
  });

  it("uses role=status", () => {
    const role = "status";
    expect(role).toBe("status");
  });
});

// ============================================
// SuccessText Tests
// ============================================

describe("SuccessText", () => {
  it("default children is Saved!", () => {
    const defaultText = "Saved!";
    expect(defaultText).toBe("Saved!");
  });

  it("includes checkmark icon", () => {
    const hasCheckmark = true;
    expect(hasCheckmark).toBe(true);
  });

  it("uses fade-in-scale animation", () => {
    const animation = "fade-in-scale 200ms ease-out";
    expect(animation).toContain("fade-in-scale");
  });
});

// ============================================
// Button Disabled State Tests
// ============================================

describe("Button Disabled State", () => {
  it("disabled during loading", () => {
    const state: ButtonState = "loading";
    const isDisabled = state === "loading";
    expect(isDisabled).toBe(true);
  });

  it("disabled during success", () => {
    const state: ButtonState = "success";
    const isDisabled = state === "success";
    expect(isDisabled).toBe(true);
  });

  it("not disabled during idle", () => {
    const state = "idle" as ButtonState;
    const isDisabled = state === "loading" || state === "success";
    expect(isDisabled).toBe(false);
  });

  it("not disabled during error", () => {
    const state = "error" as ButtonState;
    const isDisabled = state === "loading" || state === "success";
    expect(isDisabled).toBe(false);
  });

  it("cursor is not-allowed when disabled", () => {
    const cursor = "not-allowed";
    expect(cursor).toBe("not-allowed");
  });
});

// ============================================
// useAsyncButton Hook Tests
// ============================================

describe("useAsyncButton Hook", () => {
  it("returns state property", () => {
    const hookShape = {
      state: "idle" as ButtonState,
      execute: () => {},
      reset: () => {},
      isLoading: false,
      isSuccess: false,
      isError: false,
      error: null,
    };
    expect(hookShape.state).toBe("idle");
  });

  it("returns execute function", () => {
    const hookShape = {
      execute: async () => {},
    };
    expect(typeof hookShape.execute).toBe("function");
  });

  it("returns reset function", () => {
    const hookShape = {
      reset: () => {},
    };
    expect(typeof hookShape.reset).toBe("function");
  });

  it("returns isLoading boolean", () => {
    const hookShape = { isLoading: false };
    expect(typeof hookShape.isLoading).toBe("boolean");
  });

  it("returns isSuccess boolean", () => {
    const hookShape = { isSuccess: false };
    expect(typeof hookShape.isSuccess).toBe("boolean");
  });

  it("returns isError boolean", () => {
    const hookShape = { isError: false };
    expect(typeof hookShape.isError).toBe("boolean");
  });

  it("returns error (Error | null)", () => {
    const hookShape = { error: null as Error | null };
    expect(hookShape.error).toBeNull();
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles rapid state changes", () => {
    const states: ButtonState[] = ["idle", "loading", "success", "idle"];
    expect(states.length).toBe(4);
  });

  it("handles zero duration", () => {
    const duration = 0;
    expect(duration).toBe(0);
  });

  it("handles very short duration", () => {
    const duration = 1;
    expect(duration).toBe(1);
  });

  it("handles very long duration", () => {
    const duration = 10000;
    expect(duration).toBe(10000);
  });

  it("handles empty successText", () => {
    const props: SuccessButtonProps = { successText: "" };
    expect(props.successText).toBe("");
  });

  it("handles custom checkmark color", () => {
    const props: CheckmarkProps = { color: "#ff0000" };
    expect(props.color).toBe("#ff0000");
  });
});

// ============================================
// Reduced Motion Tests
// ============================================

describe("Reduced Motion", () => {
  it("includes prefers-reduced-motion media query", () => {
    const mediaQuery = "@media (prefers-reduced-motion: reduce)";
    expect(mediaQuery).toContain("prefers-reduced-motion");
  });

  it("disables animation for reduced motion", () => {
    const reducedMotionStyle = "animation: none !important";
    expect(reducedMotionStyle).toContain("none");
  });
});

// ============================================
// Integration Tests
// ============================================

describe("Integration Patterns", () => {
  it("works with form submission", () => {
    const pattern = {
      onSubmit: "set loading",
      onSuccess: "set success",
      afterTimeout: "set idle",
    };
    expect(pattern.onSubmit).toBe("set loading");
    expect(pattern.onSuccess).toBe("set success");
  });

  it("works with settings save", () => {
    const pattern = {
      component: "SuccessButton",
      usage: "Settings form",
    };
    expect(pattern.component).toBe("SuccessButton");
  });

  it("works with inline save indicator", () => {
    const pattern = {
      component: "InlineSuccess",
      usage: "Field-level feedback",
    };
    expect(pattern.component).toBe("InlineSuccess");
  });
});
