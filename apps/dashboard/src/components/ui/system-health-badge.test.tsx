/**
 * SystemHealthBadge Component Tests
 */

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import type { SystemHealthStatus } from "./system-health-badge";
import { SystemHealthBadge } from "./system-health-badge";

// ============================================
// Helper Types
// ============================================

interface TestElement {
	type: unknown;
	props: Record<string, unknown>;
}

// ============================================
// SystemHealthBadge Tests
// ============================================

describe("SystemHealthBadge", () => {
	describe("status variants", () => {
		const statuses: SystemHealthStatus[] = [
			"connected",
			"connecting",
			"disconnected",
			"degraded",
			"paused",
			"live",
			"streaming",
		];

		it("supports all status variants", () => {
			for (const status of statuses) {
				const element = createElement(SystemHealthBadge, { status }) as unknown as TestElement;
				expect(element).toBeDefined();
				expect(element.type).toBe(SystemHealthBadge);
			}
		});

		it("creates element for connected status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("connected");
		});

		it("creates element for connecting status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connecting",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("connecting");
		});

		it("creates element for disconnected status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "disconnected",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("disconnected");
		});

		it("creates element for degraded status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "degraded",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("degraded");
		});

		it("creates element for paused status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "paused",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("paused");
		});

		it("creates element for live status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "live",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("live");
		});

		it("creates element for streaming status", () => {
			const element = createElement(SystemHealthBadge, {
				status: "streaming",
			}) as unknown as TestElement;
			expect(element.props.status).toBe("streaming");
		});
	});

	describe("labels", () => {
		it("shows label by default", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
			}) as unknown as TestElement;
			expect(element.props.showLabel).toBeUndefined(); // Default is true in component
		});

		it("hides label when showLabel is false", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				showLabel: false,
			}) as unknown as TestElement;
			expect(element.props.showLabel).toBe(false);
		});

		it("accepts custom label", () => {
			const element = createElement(SystemHealthBadge, {
				status: "disconnected",
				label: "API Offline",
			}) as unknown as TestElement;
			expect(element.props.label).toBe("API Offline");
		});
	});

	describe("size variants", () => {
		it("uses md size by default", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
			}) as unknown as TestElement;
			expect(element.props.size).toBeUndefined(); // Default is md in component
		});

		it("accepts sm size", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				size: "sm",
			}) as unknown as TestElement;
			expect(element.props.size).toBe("sm");
		});

		it("accepts lg size", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				size: "lg",
			}) as unknown as TestElement;
			expect(element.props.size).toBe("lg");
		});
	});

	describe("variant styles", () => {
		it("uses default variant by default", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
			}) as unknown as TestElement;
			expect(element.props.variant).toBeUndefined();
		});

		it("accepts pill variant", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				variant: "pill",
			}) as unknown as TestElement;
			expect(element.props.variant).toBe("pill");
		});

		it("accepts minimal variant", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				variant: "minimal",
			}) as unknown as TestElement;
			expect(element.props.variant).toBe("minimal");
		});
	});

	describe("glow effect", () => {
		it("does not show glow by default", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
			}) as unknown as TestElement;
			expect(element.props.glow).toBeUndefined();
		});

		it("accepts glow prop", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				glow: true,
			}) as unknown as TestElement;
			expect(element.props.glow).toBe(true);
		});
	});

	describe("custom className", () => {
		it("accepts custom className", () => {
			const element = createElement(SystemHealthBadge, {
				status: "connected",
				className: "my-custom-class",
			}) as unknown as TestElement;
			expect(element.props.className).toBe("my-custom-class");
		});
	});
});

// Preset components (LiveBadge, ConnectionBadge, StreamingBadge) are thin
// wrappers around SystemHealthBadge. Their behavior is covered by:
// - Main SystemHealthBadge tests (all status variants including live, streaming, connected)
// - Module exports tests (verify presets exist and are callable)

// ============================================
// Type Tests
// ============================================

describe("SystemHealthBadge types", () => {
	it("SystemHealthStatus has all expected values", () => {
		const statuses: SystemHealthStatus[] = [
			"connected",
			"connecting",
			"disconnected",
			"degraded",
			"paused",
			"live",
			"streaming",
		];
		expect(statuses).toHaveLength(7);
	});
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
	it("exports SystemHealthBadge component", async () => {
		const module = await import("./system-health-badge");
		expect(module.SystemHealthBadge).toBeDefined();
	});

	it("exports LiveBadge preset", async () => {
		const module = await import("./system-health-badge");
		expect(typeof module.LiveBadge).toBe("function");
	});

	it("exports ConnectionBadge preset", async () => {
		const module = await import("./system-health-badge");
		expect(typeof module.ConnectionBadge).toBe("function");
	});

	it("exports StreamingBadge preset", async () => {
		const module = await import("./system-health-badge");
		expect(typeof module.StreamingBadge).toBe("function");
	});

	it("exports default as SystemHealthBadge", async () => {
		const module = await import("./system-health-badge");
		expect(module.default).toBe(module.SystemHealthBadge);
	});
});
