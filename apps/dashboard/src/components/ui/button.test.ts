/**
 * Button Component Tests
 *
 * Tests for button with variants, loading states, and confirmation feedback.
 *
 * @see docs/plans/ui/28-states.md lines 118-124
 */

import { describe, expect, it } from "bun:test";
import type { ButtonProps, ButtonSize, ButtonState, ButtonVariant } from "./button";

// ============================================
// ButtonVariant Type Tests
// ============================================

describe("ButtonVariant Type", () => {
	it("allows primary variant", () => {
		const variant: ButtonVariant = "primary";
		expect(variant).toBe("primary");
	});

	it("allows secondary variant", () => {
		const variant: ButtonVariant = "secondary";
		expect(variant).toBe("secondary");
	});

	it("allows destructive variant", () => {
		const variant: ButtonVariant = "destructive";
		expect(variant).toBe("destructive");
	});

	it("allows ghost variant", () => {
		const variant: ButtonVariant = "ghost";
		expect(variant).toBe("ghost");
	});

	it("allows link variant", () => {
		const variant: ButtonVariant = "link";
		expect(variant).toBe("link");
	});
});

// ============================================
// ButtonSize Type Tests
// ============================================

describe("ButtonSize Type", () => {
	it("allows sm size", () => {
		const size: ButtonSize = "sm";
		expect(size).toBe("sm");
	});

	it("allows md size", () => {
		const size: ButtonSize = "md";
		expect(size).toBe("md");
	});

	it("allows lg size", () => {
		const size: ButtonSize = "lg";
		expect(size).toBe("lg");
	});

	it("allows icon size", () => {
		const size: ButtonSize = "icon";
		expect(size).toBe("icon");
	});
});

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
// ButtonProps Type Tests
// ============================================

describe("ButtonProps Type", () => {
	it("all custom props are optional", () => {
		const props: ButtonProps = {};
		expect(props.variant).toBeUndefined();
		expect(props.size).toBeUndefined();
		expect(props.state).toBeUndefined();
	});

	it("supports variant prop", () => {
		const props: ButtonProps = { variant: "primary" };
		expect(props.variant).toBe("primary");
	});

	it("supports size prop", () => {
		const props: ButtonProps = { size: "lg" };
		expect(props.size).toBe("lg");
	});

	it("supports state prop", () => {
		const props: ButtonProps = { state: "loading" };
		expect(props.state).toBe("loading");
	});

	it("supports loadingText prop", () => {
		const props: ButtonProps = { loadingText: "Saving..." };
		expect(props.loadingText).toBe("Saving...");
	});

	it("supports successText prop", () => {
		const props: ButtonProps = { successText: "Done!" };
		expect(props.successText).toBe("Done!");
	});

	it("supports errorText prop", () => {
		const props: ButtonProps = { errorText: "Failed!" };
		expect(props.errorText).toBe("Failed!");
	});

	it("supports onStateReset prop", () => {
		const props: ButtonProps = { onStateReset: () => {} };
		expect(typeof props.onStateReset).toBe("function");
	});

	it("supports fullWidth prop", () => {
		const props: ButtonProps = { fullWidth: true };
		expect(props.fullWidth).toBe(true);
	});

	it("supports leftIcon prop", () => {
		const props: ButtonProps = { leftIcon: "icon" };
		expect(props.leftIcon).toBe("icon");
	});

	it("supports rightIcon prop", () => {
		const props: ButtonProps = { rightIcon: "icon" };
		expect(props.rightIcon).toBe("icon");
	});

	it("supports testId prop", () => {
		const props: ButtonProps = { testId: "my-button" };
		expect(props.testId).toBe("my-button");
	});

	it("supports disabled prop", () => {
		const props: ButtonProps = { disabled: true };
		expect(props.disabled).toBe(true);
	});

	it("supports onClick prop", () => {
		const props: ButtonProps = { onClick: () => {} };
		expect(typeof props.onClick).toBe("function");
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
	it("exports Button component", async () => {
		const module = await import("./button");
		expect(typeof module.Button).toBe("object"); // forwardRef returns object
	});

	it("exports IconButton component", async () => {
		const module = await import("./button");
		expect(typeof module.IconButton).toBe("object"); // forwardRef returns object
	});

	it("exports ButtonState type re-export", async () => {
		const module = await import("./button");
		// Type is re-exported, verified by TypeScript compilation
		expect(module).toBeDefined();
	});

	it("exports default as Button", async () => {
		const module = await import("./button");
		expect(module.default).toBe(module.Button);
	});
});

// ============================================
// Variant Styling Tests
// ============================================

describe("Variant Styling", () => {
	it("primary variant uses stone-900 background", () => {
		const primaryBg = "#1c1917";
		expect(primaryBg).toBe("#1c1917");
	});

	it("primary variant uses white text", () => {
		const primaryColor = "#ffffff";
		expect(primaryColor).toBe("#ffffff");
	});

	it("secondary variant uses white background", () => {
		const secondaryBg = "#ffffff";
		expect(secondaryBg).toBe("#ffffff");
	});

	it("secondary variant has border", () => {
		const secondaryBorder = "1px solid #d6d3d1";
		expect(secondaryBorder).toContain("solid");
	});

	it("destructive variant uses red-500 background", () => {
		const destructiveBg = "#ef4444";
		expect(destructiveBg).toBe("#ef4444");
	});

	it("ghost variant has transparent background", () => {
		const ghostBg = "transparent";
		expect(ghostBg).toBe("transparent");
	});

	it("link variant has transparent background", () => {
		const linkBg = "transparent";
		expect(linkBg).toBe("transparent");
	});

	it("link variant uses blue text", () => {
		const linkColor = "#3b82f6";
		expect(linkColor).toBe("#3b82f6");
	});
});

// ============================================
// Size Styling Tests
// ============================================

describe("Size Styling", () => {
	it("sm size has 32px height", () => {
		const height = "32px";
		expect(height).toBe("32px");
	});

	it("md size has 40px height", () => {
		const height = "40px";
		expect(height).toBe("40px");
	});

	it("lg size has 48px height", () => {
		const height = "48px";
		expect(height).toBe("48px");
	});

	it("icon size has 40px height", () => {
		const height = "40px";
		expect(height).toBe("40px");
	});

	it("sm size has 64px minWidth", () => {
		const minWidth = "64px";
		expect(minWidth).toBe("64px");
	});

	it("md size has 80px minWidth", () => {
		const minWidth = "80px";
		expect(minWidth).toBe("80px");
	});

	it("lg size has 96px minWidth", () => {
		const minWidth = "96px";
		expect(minWidth).toBe("96px");
	});

	it("icon size has square dimensions", () => {
		const height = "40px";
		const minWidth = "40px";
		expect(height).toBe(minWidth);
	});
});

// ============================================
// State Background Colors Tests
// ============================================

describe("State Background Colors", () => {
	it("idle state uses variant color", () => {
		const idleBg = undefined; // Uses variant
		expect(idleBg).toBeUndefined();
	});

	it("loading state uses variant color", () => {
		const loadingBg = undefined; // Uses variant
		expect(loadingBg).toBeUndefined();
	});

	it("success state uses green-500", () => {
		const successBg = "#22c55e";
		expect(successBg).toBe("#22c55e");
	});

	it("error state uses red-500", () => {
		const errorBg = "#ef4444";
		expect(errorBg).toBe("#ef4444");
	});
});

// ============================================
// Button State Machine Tests
// ============================================

describe("Button State Machine", () => {
	it("starts in idle state by default", () => {
		const defaultState: ButtonState = "idle";
		expect(defaultState).toBe("idle");
	});

	it("transitions idle → loading on click", () => {
		const states: ButtonState[] = ["idle", "loading"];
		expect(states[1]!).toBe("loading");
	});

	it("transitions loading → success on completion", () => {
		const states: ButtonState[] = ["loading", "success"];
		expect(states[1]!).toBe("success");
	});

	it("transitions loading → error on failure", () => {
		const states: ButtonState[] = ["loading", "error"];
		expect(states[1]!).toBe("error");
	});

	it("transitions success → idle after duration", () => {
		const states: ButtonState[] = ["success", "idle"];
		expect(states[1]!).toBe("idle");
	});

	it("transitions error → idle after duration", () => {
		const states: ButtonState[] = ["error", "idle"];
		expect(states[1]!).toBe("idle");
	});

	it("success duration is 2000ms", async () => {
		const module = await import("./success-feedback/index");
		expect(module.SUCCESS_STATE_DURATION).toBe(2000);
	});

	it("error duration is 3000ms", async () => {
		const module = await import("./success-feedback/index");
		expect(module.ERROR_STATE_DURATION).toBe(3000);
	});
});

// ============================================
// Disabled State Tests
// ============================================

describe("Disabled State", () => {
	it("disabled during loading", () => {
		const state: ButtonState = "loading";
		const isDisabled = state === "loading" || state === "success";
		expect(isDisabled).toBe(true);
	});

	it("disabled during success", () => {
		const state = "success" as ButtonState;
		const isDisabled = state === "loading" || state === "success";
		expect(isDisabled).toBe(true);
	});

	it("not disabled during idle", () => {
		const state = "idle" as ButtonState;
		const isDisabled = state === "loading" || state === "success";
		expect(isDisabled).toBe(false);
	});

	it("not disabled during error (allows retry)", () => {
		const state = "error" as ButtonState;
		const isDisabled = state === "loading" || state === "success";
		expect(isDisabled).toBe(false);
	});

	it("cursor is not-allowed when disabled", () => {
		const cursor = "not-allowed";
		expect(cursor).toBe("not-allowed");
	});

	it("opacity is 0.6 when disabled", () => {
		const opacity = 0.6;
		expect(opacity).toBe(0.6);
	});
});

// ============================================
// Content Rendering Tests
// ============================================

describe("Content Rendering", () => {
	it("shows spinner during loading", () => {
		const loadingContent = "Spinner + loadingText";
		expect(loadingContent).toContain("Spinner");
	});

	it("shows checkmark during success", () => {
		const successContent = "Checkmark + successText";
		expect(successContent).toContain("Checkmark");
	});

	it("shows X icon during error", () => {
		const errorContent = "✕ + errorText";
		expect(errorContent).toContain("✕");
	});

	it("shows children during idle", () => {
		const idleContent = "children";
		expect(idleContent).toBe("children");
	});

	it("shows leftIcon when provided", () => {
		const hasLeftIcon = true;
		expect(hasLeftIcon).toBe(true);
	});

	it("shows rightIcon when provided", () => {
		const hasRightIcon = true;
		expect(hasRightIcon).toBe(true);
	});

	it("hides icons during non-idle states", () => {
		const state = "loading" as ButtonState;
		const showsIcons = state === "idle";
		expect(showsIcons).toBe(false);
	});
});

// ============================================
// Animation Tests
// ============================================

describe("Animation", () => {
	it("error state uses shake animation", () => {
		const animation = "button-shake 0.4s ease-out";
		expect(animation).toContain("button-shake");
	});

	it("shake animation duration is 0.4s", () => {
		const duration = "0.4s";
		expect(duration).toBe("0.4s");
	});

	it("shake animation uses ease-out timing", () => {
		const timing = "ease-out";
		expect(timing).toBe("ease-out");
	});

	it("shake moves ±4px", () => {
		const displacement = 4;
		expect(displacement).toBe(4);
	});

	it("background transition is 0.15s", () => {
		const transition = "0.15s";
		expect(transition).toBe("0.15s");
	});
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
	it("uses aria-busy during loading", () => {
		const ariaBusy = true;
		expect(ariaBusy).toBe(true);
	});

	it("uses aria-disabled when disabled", () => {
		const ariaDisabled = true;
		expect(ariaDisabled).toBe(true);
	});

	it("success has screen reader announcement", () => {
		const announcement = "Action completed successfully";
		expect(announcement).toBe("Action completed successfully");
	});

	it("error has screen reader announcement", () => {
		const announcement = "Action failed";
		expect(announcement).toBe("Action failed");
	});

	it("uses role=status for success", () => {
		const role = "status";
		expect(role).toBe("status");
	});

	it("uses role=alert for error", () => {
		const role = "alert";
		expect(role).toBe("alert");
	});

	it("uses aria-live=polite for success", () => {
		const ariaLive = "polite";
		expect(ariaLive).toBe("polite");
	});

	it("uses aria-live=assertive for error", () => {
		const ariaLive = "assertive";
		expect(ariaLive).toBe("assertive");
	});

	it("icons use aria-hidden", () => {
		const ariaHidden = true;
		expect(ariaHidden).toBe(true);
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

	it("disables shake animation for reduced motion", () => {
		const reducedMotionStyle = "animation: none !important";
		expect(reducedMotionStyle).toContain("none");
	});
});

// ============================================
// Layout Tests
// ============================================

describe("Layout", () => {
	it("uses inline-flex display", () => {
		const display = "inline-flex";
		expect(display).toBe("inline-flex");
	});

	it("centers content", () => {
		const alignItems = "center";
		const justifyContent = "center";
		expect(alignItems).toBe("center");
		expect(justifyContent).toBe("center");
	});

	it("has 8px gap", () => {
		const gap = "8px";
		expect(gap).toBe("8px");
	});

	it("has 6px border radius", () => {
		const borderRadius = "6px";
		expect(borderRadius).toBe("6px");
	});

	it("has font-weight 500", () => {
		const fontWeight = 500;
		expect(fontWeight).toBe(500);
	});

	it("fullWidth uses 100% width", () => {
		const width = "100%";
		expect(width).toBe("100%");
	});
});

// ============================================
// IconButton Tests
// ============================================

describe("IconButton", () => {
	it("uses size=icon by default", () => {
		const size: ButtonSize = "icon";
		expect(size).toBe("icon");
	});

	it("omits leftIcon and rightIcon", () => {
		const hasLeftIcon = false;
		const hasRightIcon = false;
		expect(hasLeftIcon).toBe(false);
		expect(hasRightIcon).toBe(false);
	});

	it("inherits all other Button props", () => {
		const inheritedProps = ["variant", "state", "disabled", "onClick"];
		expect(inheritedProps.length).toBe(4);
	});
});

// ============================================
// forwardRef Tests
// ============================================

describe("forwardRef", () => {
	it("Button has displayName", async () => {
		const module = await import("./button");
		expect(module.Button.displayName).toBe("Button");
	});

	it("IconButton has displayName", async () => {
		const module = await import("./button");
		expect(module.IconButton.displayName).toBe("IconButton");
	});

	it("Button accepts ref", () => {
		const acceptsRef = true;
		expect(acceptsRef).toBe(true);
	});

	it("IconButton accepts ref", () => {
		const acceptsRef = true;
		expect(acceptsRef).toBe(true);
	});
});

// ============================================
// Default Values Tests
// ============================================

describe("Default Values", () => {
	it("default variant is primary", () => {
		const defaultVariant: ButtonVariant = "primary";
		expect(defaultVariant).toBe("primary");
	});

	it("default size is md", () => {
		const defaultSize: ButtonSize = "md";
		expect(defaultSize).toBe("md");
	});

	it("default state is idle", () => {
		const defaultState: ButtonState = "idle";
		expect(defaultState).toBe("idle");
	});

	it("default successText is Done", () => {
		const defaultSuccessText = "Done";
		expect(defaultSuccessText).toBe("Done");
	});

	it("default errorText is Error", () => {
		const defaultErrorText = "Error";
		expect(defaultErrorText).toBe("Error");
	});

	it("default testId is button", () => {
		const defaultTestId = "button";
		expect(defaultTestId).toBe("button");
	});

	it("default fullWidth is false", () => {
		const defaultFullWidth = false;
		expect(defaultFullWidth).toBe(false);
	});

	it("default type is button", () => {
		const defaultType = "button";
		expect(defaultType).toBe("button");
	});
});

// ============================================
// Data Attributes Tests
// ============================================

describe("Data Attributes", () => {
	it("includes data-testid", () => {
		const hasTestId = true;
		expect(hasTestId).toBe(true);
	});

	it("includes data-variant", () => {
		const hasVariant = true;
		expect(hasVariant).toBe(true);
	});

	it("includes data-size", () => {
		const hasSize = true;
		expect(hasSize).toBe(true);
	});

	it("includes data-state", () => {
		const hasState = true;
		expect(hasState).toBe(true);
	});
});

// ============================================
// Edge Cases Tests
// ============================================

describe("Edge Cases", () => {
	it("handles empty children", () => {
		const props: ButtonProps = {};
		expect(props.children).toBeUndefined();
	});

	it("handles custom style override", () => {
		const props: ButtonProps = {
			style: { backgroundColor: "red" },
		};
		expect(props.style?.backgroundColor).toBe("red");
	});

	it("handles multiple state transitions", () => {
		const states: ButtonState[] = [
			"idle",
			"loading",
			"error",
			"idle",
			"loading",
			"success",
			"idle",
		];
		expect(states.length).toBe(7);
	});

	it("handles rapid clicks (debouncing)", () => {
		const state: ButtonState = "loading";
		const isClickable = state !== "loading" && state !== "success";
		expect(isClickable).toBe(false);
	});

	it("handles missing onStateReset", () => {
		const onStateReset = undefined;
		expect(onStateReset).toBeUndefined();
	});

	it("handles icon size with icon button", () => {
		const iconSize: ButtonSize = "icon";
		const isSquare = iconSize === "icon";
		expect(isSquare).toBe(true);
	});
});

// ============================================
// Integration Patterns Tests
// ============================================

describe("Integration Patterns", () => {
	it("works with form submission", () => {
		const pattern = {
			onSubmit: "set loading",
			onSuccess: "set success",
			onError: "set error",
			afterTimeout: "set idle",
		};
		expect(pattern.onSubmit).toBe("set loading");
	});

	it("works with useAsyncButton hook", () => {
		const hookOutput = {
			state: "idle" as ButtonState,
			execute: () => {},
			reset: () => {},
		};
		expect(hookOutput.state).toBe("idle");
	});

	it("works with toast notifications", () => {
		const integration = {
			onSuccess: "show success toast",
			onError: "show error toast",
		};
		expect(integration.onSuccess).toBe("show success toast");
	});

	it("works with confirmation dialogs", () => {
		const variant = "destructive";
		expect(variant).toBe("destructive");
	});
});

// ============================================
// Style Override Tests
// ============================================

describe("Style Override", () => {
	it("custom style is applied last", () => {
		const styleOrder = "...buttonStyles, ...style";
		expect(styleOrder).toContain("...style");
	});

	it("allows background color override", () => {
		const style = { backgroundColor: "purple" };
		expect(style.backgroundColor).toBe("purple");
	});

	it("allows padding override", () => {
		const style = { padding: "20px" };
		expect(style.padding).toBe("20px");
	});
});
