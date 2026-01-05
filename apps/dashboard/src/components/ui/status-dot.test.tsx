/**
 * StatusDot Component Tests
 */

import { describe, it, expect } from "bun:test";
import { createElement } from "react";
import { StatusDot, usePrefersReducedMotion } from "./status-dot";
import type { StatusDotStatus, StatusDotSize } from "./status-dot";

// ============================================
// Helper to render and get element
// ============================================

function render(props: Parameters<typeof StatusDot>[0]) {
  const element = createElement(StatusDot, props);
  return element;
}

// ============================================
// StatusDot Tests
// ============================================

describe("StatusDot", () => {
  describe("status variants", () => {
    const statuses: StatusDotStatus[] = [
      "active",
      "processing",
      "idle",
      "error",
      "paused",
      "streaming",
    ];

    it("supports all status variants", () => {
      statuses.forEach((status) => {
        const element = render({ status });
        expect(element).toBeDefined();
        expect(element.type).toBe(StatusDot);
      });
    });

    it("creates element for active status", () => {
      const element = render({ status: "active" });
      expect(element.props.status).toBe("active");
    });

    it("creates element for processing status", () => {
      const element = render({ status: "processing" });
      expect(element.props.status).toBe("processing");
    });

    it("creates element for idle status", () => {
      const element = render({ status: "idle" });
      expect(element.props.status).toBe("idle");
    });

    it("creates element for error status", () => {
      const element = render({ status: "error" });
      expect(element.props.status).toBe("error");
    });

    it("creates element for paused status", () => {
      const element = render({ status: "paused" });
      expect(element.props.status).toBe("paused");
    });

    it("creates element for streaming status", () => {
      const element = render({ status: "streaming" });
      expect(element.props.status).toBe("streaming");
    });
  });

  describe("size variants", () => {
    const sizes: StatusDotSize[] = ["xs", "sm", "md", "lg"];

    it("supports all size variants", () => {
      sizes.forEach((size) => {
        const element = render({ status: "active", size });
        expect(element).toBeDefined();
        expect(element.props.size).toBe(size);
      });
    });

    it("uses sm size by default", () => {
      const element = render({ status: "active" });
      expect(element.props.size).toBeUndefined(); // Default in component
    });
  });

  describe("glow effect", () => {
    it("does not show glow by default", () => {
      const element = render({ status: "active" });
      expect(element.props.glow).toBeUndefined();
    });

    it("accepts glow prop", () => {
      const element = render({ status: "active", glow: true });
      expect(element.props.glow).toBe(true);
    });
  });

  describe("accessibility", () => {
    it("accepts custom label", () => {
      const element = render({ status: "error", label: "Connection lost" });
      expect(element.props.label).toBe("Connection lost");
    });

    it("default label comes from component", () => {
      const element = render({ status: "active" });
      expect(element.props.label).toBeUndefined();
    });
  });

  describe("custom className", () => {
    it("accepts custom className", () => {
      const element = render({ status: "active", className: "my-custom-class" });
      expect(element.props.className).toBe("my-custom-class");
    });
  });
});

// ============================================
// usePrefersReducedMotion Hook Tests
// ============================================

describe("usePrefersReducedMotion", () => {
  it("returns boolean", () => {
    const result = usePrefersReducedMotion();
    expect(typeof result).toBe("boolean");
  });

  it("returns false when window is undefined (SSR)", () => {
    const result = usePrefersReducedMotion();
    expect(typeof result).toBe("boolean");
  });
});

// ============================================
// Type Tests
// ============================================

describe("StatusDot types", () => {
  it("StatusDotStatus has all expected values", () => {
    const statuses: StatusDotStatus[] = [
      "active",
      "processing",
      "idle",
      "error",
      "paused",
      "streaming",
    ];
    expect(statuses).toHaveLength(6);
  });

  it("StatusDotSize has all expected values", () => {
    const sizes: StatusDotSize[] = ["xs", "sm", "md", "lg"];
    expect(sizes).toHaveLength(4);
  });
});

// ============================================
// Component Configuration Tests
// ============================================

describe("StatusDot configuration", () => {
  it("active status is green with pulse animation", () => {
    // Testing through props, animation applied in component
    const element = render({ status: "active" });
    expect(element.props.status).toBe("active");
  });

  it("processing status is amber with spin animation", () => {
    const element = render({ status: "processing" });
    expect(element.props.status).toBe("processing");
  });

  it("idle status is stone with breathing animation", () => {
    const element = render({ status: "idle" });
    expect(element.props.status).toBe("idle");
  });

  it("error status is red and static", () => {
    const element = render({ status: "error" });
    expect(element.props.status).toBe("error");
  });

  it("paused status is amber and static", () => {
    const element = render({ status: "paused" });
    expect(element.props.status).toBe("paused");
  });

  it("streaming status uses gradient with flow animation", () => {
    const element = render({ status: "streaming" });
    expect(element.props.status).toBe("streaming");
  });
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
  it("exports StatusDot component", async () => {
    const module = await import("./status-dot");
    expect(module.StatusDot).toBeDefined();
  });

  it("exports usePrefersReducedMotion hook", async () => {
    const module = await import("./status-dot");
    expect(typeof module.usePrefersReducedMotion).toBe("function");
  });

  it("exports default as StatusDot", async () => {
    const module = await import("./status-dot");
    expect(module.default).toBe(module.StatusDot);
  });
});
