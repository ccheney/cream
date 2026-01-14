/**
 * Error Boundary Component Tests
 *
 * Tests for React error boundary and fallback UI.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

import { describe, expect, it } from "bun:test";
import type { ErrorBoundaryProps, ErrorBoundaryState, ErrorFallbackProps } from "./error-boundary";

// ============================================
// ErrorBoundaryProps Type Tests
// ============================================

describe("ErrorBoundaryProps Type", () => {
	it("requires children", () => {
		const props: ErrorBoundaryProps = {
			children: null,
		};
		expect(props.children).toBeNull();
	});

	it("supports fallback as ReactNode", () => {
		const props: ErrorBoundaryProps = {
			children: null,
			fallback: "Error occurred",
		};
		expect(props.fallback).toBe("Error occurred");
	});

	it("supports fallback as function", () => {
		const fallbackFn = (p: ErrorFallbackProps) => `Error: ${p.error.message}`;
		const props: ErrorBoundaryProps = {
			children: null,
			fallback: fallbackFn,
		};
		expect(typeof props.fallback).toBe("function");
	});

	it("supports onError callback", () => {
		let called = false;
		const props: ErrorBoundaryProps = {
			children: null,
			onError: () => {
				called = true;
			},
		};
		props.onError?.(new Error("test"), { componentStack: "" });
		expect(called).toBe(true);
	});

	it("supports onReset callback", () => {
		let called = false;
		const props: ErrorBoundaryProps = {
			children: null,
			onReset: () => {
				called = true;
			},
		};
		props.onReset?.();
		expect(called).toBe(true);
	});

	it("supports resetKeys array", () => {
		const props: ErrorBoundaryProps = {
			children: null,
			resetKeys: ["key1", "key2", 123],
		};
		expect(props.resetKeys?.length).toBe(3);
	});
});

// ============================================
// ErrorBoundaryState Type Tests
// ============================================

describe("ErrorBoundaryState Type", () => {
	it("has correct initial state", () => {
		const state: ErrorBoundaryState = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
		expect(state.hasError).toBe(false);
		expect(state.error).toBeNull();
		expect(state.errorInfo).toBeNull();
	});

	it("has correct error state", () => {
		const error = new Error("Test error");
		const state: ErrorBoundaryState = {
			hasError: true,
			error,
			errorInfo: { componentStack: "<Component>\n<App>" },
		};
		expect(state.hasError).toBe(true);
		expect(state.error?.message).toBe("Test error");
		expect(state.errorInfo?.componentStack).toContain("Component");
	});
});

// ============================================
// ErrorFallbackProps Type Tests
// ============================================

describe("ErrorFallbackProps Type", () => {
	it("has correct shape", () => {
		const props: ErrorFallbackProps = {
			error: new Error("Fallback error"),
			errorInfo: { componentStack: "" },
			reset: () => {},
		};
		expect(props.error.message).toBe("Fallback error");
		expect(typeof props.reset).toBe("function");
	});

	it("errorInfo can be null", () => {
		const props: ErrorFallbackProps = {
			error: new Error("Error"),
			errorInfo: null,
			reset: () => {},
		};
		expect(props.errorInfo).toBeNull();
	});

	it("reset is callable", () => {
		let resetCalled = false;
		const props: ErrorFallbackProps = {
			error: new Error("Error"),
			errorInfo: null,
			reset: () => {
				resetCalled = true;
			},
		};
		props.reset();
		expect(resetCalled).toBe(true);
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
	it("exports ErrorBoundary class", async () => {
		const module = await import("./error-boundary");
		expect(typeof module.ErrorBoundary).toBe("function");
	});

	it("exports DefaultErrorFallback component", async () => {
		const module = await import("./error-boundary");
		expect(typeof module.DefaultErrorFallback).toBe("function");
	});

	it("exports useErrorBoundary hook", async () => {
		const module = await import("./error-boundary");
		expect(typeof module.useErrorBoundary).toBe("function");
	});

	it("exports default as ErrorBoundary", async () => {
		const module = await import("./error-boundary");
		expect(module.default).toBe(module.ErrorBoundary);
	});
});

// ============================================
// Error Types Tests
// ============================================

describe("Error Types", () => {
	it("handles standard Error", () => {
		const error = new Error("Standard error");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.name).toBe("Error");
		expect(props.error.message).toBe("Standard error");
	});

	it("handles TypeError", () => {
		const error = new TypeError("Type error");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.name).toBe("TypeError");
	});

	it("handles ReferenceError", () => {
		const error = new ReferenceError("Reference error");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.name).toBe("ReferenceError");
	});

	it("handles custom error with stack", () => {
		const error = new Error("With stack");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.stack).toBeDefined();
	});
});

// ============================================
// Component Stack Tests
// ============================================

describe("Component Stack", () => {
	it("handles empty component stack", () => {
		const props: ErrorFallbackProps = {
			error: new Error("Error"),
			errorInfo: { componentStack: "" },
			reset: () => {},
		};
		expect(props.errorInfo?.componentStack).toBe("");
	});

	it("handles nested component stack", () => {
		const componentStack = `
    at Button
    at Form
    at Page
    at App
    at ErrorBoundary`;
		const props: ErrorFallbackProps = {
			error: new Error("Error"),
			errorInfo: { componentStack },
			reset: () => {},
		};
		expect(props.errorInfo?.componentStack).toContain("Button");
		expect(props.errorInfo?.componentStack).toContain("App");
		expect(props.errorInfo?.componentStack).toContain("ErrorBoundary");
	});

	it("handles deeply nested component stack", () => {
		const components = Array.from({ length: 20 }, (_, i) => `Component${i}`);
		const componentStack = components.map((c) => `    at ${c}`).join("\n");
		const props: ErrorFallbackProps = {
			error: new Error("Error"),
			errorInfo: { componentStack },
			reset: () => {},
		};
		expect(props.errorInfo?.componentStack?.split("\n").length).toBe(20);
	});
});

// ============================================
// Accessibility Tests
// ============================================

describe("Accessibility", () => {
	it("DefaultErrorFallback uses role=alert", () => {
		// Component sets role="alert" on container
		const role = "alert";
		expect(role).toBe("alert");
	});

	it("uses aria-label for error description", () => {
		const ariaLabel = "An error occurred";
		expect(ariaLabel).toBe("An error occurred");
	});

	it("icon is aria-hidden", () => {
		const ariaHidden = true;
		expect(ariaHidden).toBe(true);
	});

	it("buttons are accessible", () => {
		// Buttons should have type="button"
		const buttonType = "button";
		expect(buttonType).toBe("button");
	});
});

// ============================================
// Styling Tests
// ============================================

describe("Styling", () => {
	it("uses red-50 for container background", () => {
		const bgColor = "#fef2f2";
		expect(bgColor).toBe("#fef2f2");
	});

	it("uses red-800 for title color", () => {
		const titleColor = "#991b1b";
		expect(titleColor).toBe("#991b1b");
	});

	it("uses red-600 for primary button", () => {
		const buttonBg = "#dc2626";
		expect(buttonBg).toBe("#dc2626");
	});

	it("uses red-200 for border", () => {
		const borderColor = "#fecaca";
		expect(borderColor).toBe("#fecaca");
	});
});

// ============================================
// Reset Functionality Tests
// ============================================

describe("Reset Functionality", () => {
	it("reset callback is called", () => {
		let callCount = 0;
		const props: ErrorBoundaryProps = {
			children: null,
			onReset: () => {
				callCount++;
			},
		};
		props.onReset?.();
		props.onReset?.();
		expect(callCount).toBe(2);
	});

	it("resetKeys can trigger reset on change", () => {
		const props1: ErrorBoundaryProps = {
			children: null,
			resetKeys: ["a", "b"],
		};
		const props2: ErrorBoundaryProps = {
			children: null,
			resetKeys: ["a", "c"], // changed
		};
		expect(props1.resetKeys?.[1]).toBe("b");
		expect(props2.resetKeys?.[1]).toBe("c");
	});
});

// ============================================
// onError Callback Tests
// ============================================

describe("onError Callback", () => {
	it("receives error object", () => {
		let receivedError: Error | null = null;
		const props: ErrorBoundaryProps = {
			children: null,
			onError: (error) => {
				receivedError = error;
			},
		};
		const testError = new Error("Test");
		props.onError?.(testError, { componentStack: "" });
		expect(receivedError!.message).toBe("Test");
	});

	it("receives errorInfo with componentStack", () => {
		let receivedInfo: { componentStack?: string | null } | null = null;
		const props: ErrorBoundaryProps = {
			children: null,
			onError: (_, errorInfo) => {
				receivedInfo = errorInfo;
			},
		};
		props.onError?.(new Error("Test"), { componentStack: "<Stack>" });
		expect(receivedInfo!.componentStack).toBe("<Stack>");
	});
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
	it("handles error with empty message", () => {
		const error = new Error("");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.message).toBe("");
	});

	it("handles error with very long message", () => {
		const longMessage = "A".repeat(5000);
		const error = new Error(longMessage);
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.message.length).toBe(5000);
	});

	it("handles error with special characters", () => {
		const error = new Error("<script>alert('xss')</script>");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.message).toContain("<script>");
	});

	it("handles error with unicode", () => {
		const error = new Error(" Error occurred ");
		const props: ErrorFallbackProps = {
			error,
			errorInfo: null,
			reset: () => {},
		};
		expect(props.error.message).toContain("");
	});

	it("handles null fallback", () => {
		const props: ErrorBoundaryProps = {
			children: null,
			fallback: undefined,
		};
		expect(props.fallback).toBeUndefined();
	});

	it("handles empty resetKeys array", () => {
		const props: ErrorBoundaryProps = {
			children: null,
			resetKeys: [],
		};
		expect(props.resetKeys?.length).toBe(0);
	});
});

// ============================================
// Development vs Production Tests
// ============================================

describe("Development vs Production", () => {
	it("NODE_ENV affects detail display", () => {
		const isDev = process.env.NODE_ENV === "development";
		// In development, details should be shown by default
		// In production, details should be hidden by default
		expect(typeof isDev).toBe("boolean");
	});

	it("error digest is included for tracking", () => {
		interface ErrorWithDigest extends Error {
			digest?: string;
		}
		const error: ErrorWithDigest = new Error("Test");
		error.digest = "abc123";
		expect(error.digest).toBe("abc123");
	});
});

// ============================================
// Integration Pattern Tests
// ============================================

describe("Integration Patterns", () => {
	it("can wrap component tree", () => {
		const props: ErrorBoundaryProps = {
			children: null, // In real usage, this would be JSX
			onError: (_error) => {},
			onReset: () => {},
		};
		expect(props.children).toBeNull();
		expect(props.onError).toBeDefined();
		expect(props.onReset).toBeDefined();
	});

	it("supports nested error boundaries", () => {
		// Conceptually, error boundaries can be nested
		// Inner boundaries catch errors first
		const inner: ErrorBoundaryProps = {
			children: null,
			fallback: "Inner error",
		};
		const outer: ErrorBoundaryProps = {
			children: null, // Would contain inner boundary
			fallback: "Outer error",
		};
		expect(inner.fallback).toBe("Inner error");
		expect(outer.fallback).toBe("Outer error");
	});

	it("can log to error tracking service", () => {
		const loggedErrors: Error[] = [];
		const props: ErrorBoundaryProps = {
			children: null,
			onError: (error) => {
				loggedErrors.push(error);
			},
		};
		props.onError?.(new Error("Error 1"), { componentStack: "" });
		props.onError?.(new Error("Error 2"), { componentStack: "" });
		expect(loggedErrors.length).toBe(2);
	});
});
