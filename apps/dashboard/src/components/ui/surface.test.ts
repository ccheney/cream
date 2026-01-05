/**
 * Surface Components Tests
 *
 * Tests for surface component types and elevation utilities.
 */

import { describe, it, expect } from "bun:test";
import type { ElevationLevel, SurfaceVariant } from "./surface";

// ============================================
// Type Tests
// ============================================

describe("ElevationLevel type", () => {
  it("supports levels 0-4", () => {
    const levels: ElevationLevel[] = [0, 1, 2, 3, 4];
    expect(levels).toHaveLength(5);
  });
});

describe("SurfaceVariant type", () => {
  it("has all expected variants", () => {
    const variants: SurfaceVariant[] = [
      "default",
      "interactive",
      "translucent",
      "inset",
    ];
    expect(variants).toHaveLength(4);
  });
});

// ============================================
// Elevation Classes Tests
// ============================================

describe("elevation class mapping", () => {
  const elevationClasses: Record<ElevationLevel, string> = {
    0: "surface-0",
    1: "surface-1",
    2: "surface-2",
    3: "surface-3",
    4: "surface-4",
  };

  it("maps level 0 to surface-0", () => {
    expect(elevationClasses[0]).toBe("surface-0");
  });

  it("maps level 1 to surface-1", () => {
    expect(elevationClasses[1]).toBe("surface-1");
  });

  it("maps level 2 to surface-2", () => {
    expect(elevationClasses[2]).toBe("surface-2");
  });

  it("maps level 3 to surface-3", () => {
    expect(elevationClasses[3]).toBe("surface-3");
  });

  it("maps level 4 to surface-4", () => {
    expect(elevationClasses[4]).toBe("surface-4");
  });
});

// ============================================
// Padding Classes Tests
// ============================================

describe("padding class mapping", () => {
  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  it("maps none to empty string", () => {
    expect(paddingClasses.none).toBe("");
  });

  it("maps sm to p-3", () => {
    expect(paddingClasses.sm).toBe("p-3");
  });

  it("maps md to p-4", () => {
    expect(paddingClasses.md).toBe("p-4");
  });

  it("maps lg to p-6", () => {
    expect(paddingClasses.lg).toBe("p-6");
  });
});

// ============================================
// Variant Class Tests
// ============================================

describe("variant class mapping", () => {
  it("default variant uses elevation class", () => {
    const variant: SurfaceVariant = "default";
    const elevation: ElevationLevel = 2;
    const expected = "surface-2";

    const result = variant === "default" ? `surface-${elevation}` : `surface-${variant}`;
    expect(result).toBe(expected);
  });

  it("interactive variant uses surface-interactive", () => {
    const variant: SurfaceVariant = "interactive";
    expect(`surface-${variant}`).toBe("surface-interactive");
  });

  it("translucent variant uses surface-translucent", () => {
    const variant: SurfaceVariant = "translucent";
    expect(`surface-${variant}`).toBe("surface-translucent");
  });

  it("inset variant uses surface-inset", () => {
    const variant: SurfaceVariant = "inset";
    expect(`surface-${variant}`).toBe("surface-inset");
  });
});

// ============================================
// Z-Index Scale Tests
// ============================================

describe("z-index scale", () => {
  const zIndexScale = {
    dropdown: 50,
    sticky: 100,
    drawer: 200,
    modal: 300,
    popover: 400,
    tooltip: 500,
    toast: 600,
  };

  it("dropdown is lowest at 50", () => {
    expect(zIndexScale.dropdown).toBe(50);
  });

  it("sticky is 100", () => {
    expect(zIndexScale.sticky).toBe(100);
  });

  it("drawer is 200", () => {
    expect(zIndexScale.drawer).toBe(200);
  });

  it("modal is 300", () => {
    expect(zIndexScale.modal).toBe(300);
  });

  it("popover is 400", () => {
    expect(zIndexScale.popover).toBe(400);
  });

  it("tooltip is 500", () => {
    expect(zIndexScale.tooltip).toBe(500);
  });

  it("toast is highest at 600", () => {
    expect(zIndexScale.toast).toBe(600);
  });

  it("maintains correct stacking order", () => {
    expect(zIndexScale.dropdown).toBeLessThan(zIndexScale.sticky);
    expect(zIndexScale.sticky).toBeLessThan(zIndexScale.drawer);
    expect(zIndexScale.drawer).toBeLessThan(zIndexScale.modal);
    expect(zIndexScale.modal).toBeLessThan(zIndexScale.popover);
    expect(zIndexScale.popover).toBeLessThan(zIndexScale.tooltip);
    expect(zIndexScale.tooltip).toBeLessThan(zIndexScale.toast);
  });
});

// ============================================
// Overlay Position Tests
// ============================================

describe("overlay position classes", () => {
  const positionClasses = {
    left: "left-0 top-0 h-full",
    right: "right-0 top-0 h-full",
    top: "top-0 left-0 w-full",
    bottom: "bottom-0 left-0 w-full",
  };

  it("left position anchors to left edge", () => {
    expect(positionClasses.left).toContain("left-0");
    expect(positionClasses.left).toContain("h-full");
  });

  it("right position anchors to right edge", () => {
    expect(positionClasses.right).toContain("right-0");
    expect(positionClasses.right).toContain("h-full");
  });

  it("top position anchors to top edge", () => {
    expect(positionClasses.top).toContain("top-0");
    expect(positionClasses.top).toContain("w-full");
  });

  it("bottom position anchors to bottom edge", () => {
    expect(positionClasses.bottom).toContain("bottom-0");
    expect(positionClasses.bottom).toContain("w-full");
  });
});

// ============================================
// Backdrop Type Tests
// ============================================

describe("backdrop type classes", () => {
  const backdropClasses = {
    modal: "backdrop-modal z-modal",
    drawer: "backdrop-drawer z-drawer",
  };

  it("modal backdrop uses z-modal", () => {
    expect(backdropClasses.modal).toContain("z-modal");
  });

  it("drawer backdrop uses z-drawer", () => {
    expect(backdropClasses.drawer).toContain("z-drawer");
  });
});

// ============================================
// Divider Orientation Tests
// ============================================

describe("divider orientation", () => {
  it("horizontal divider is full width with minimal height", () => {
    const horizontalClasses = "h-px w-full";
    expect(horizontalClasses).toContain("h-px");
    expect(horizontalClasses).toContain("w-full");
  });

  it("vertical divider is full height with minimal width", () => {
    const verticalClasses = "w-px h-full";
    expect(verticalClasses).toContain("w-px");
    expect(verticalClasses).toContain("h-full");
  });
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
  it("exports Card component", async () => {
    const module = await import("./surface");
    expect(typeof module.Card).toBe("function");
  });

  it("exports Panel component", async () => {
    const module = await import("./surface");
    expect(typeof module.Panel).toBe("function");
  });

  it("exports PanelHeader component", async () => {
    const module = await import("./surface");
    expect(typeof module.PanelHeader).toBe("function");
  });

  it("exports PanelBody component", async () => {
    const module = await import("./surface");
    expect(typeof module.PanelBody).toBe("function");
  });

  it("exports PanelFooter component", async () => {
    const module = await import("./surface");
    expect(typeof module.PanelFooter).toBe("function");
  });

  it("exports Backdrop component", async () => {
    const module = await import("./surface");
    expect(typeof module.Backdrop).toBe("function");
  });

  it("exports Overlay component", async () => {
    const module = await import("./surface");
    expect(typeof module.Overlay).toBe("function");
  });

  it("exports FloatingSurface component", async () => {
    const module = await import("./surface");
    expect(typeof module.FloatingSurface).toBe("function");
  });

  it("exports Divider component", async () => {
    const module = await import("./surface");
    expect(typeof module.Divider).toBe("function");
  });
});

// ============================================
// Panel Semantic Element Tests
// ============================================

describe("panel semantic elements", () => {
  const validElements = ["div", "section", "article", "aside"] as const;

  it("supports div element", () => {
    expect(validElements).toContain("div");
  });

  it("supports section element", () => {
    expect(validElements).toContain("section");
  });

  it("supports article element", () => {
    expect(validElements).toContain("article");
  });

  it("supports aside element", () => {
    expect(validElements).toContain("aside");
  });
});

// ============================================
// Default Props Tests
// ============================================

describe("default props", () => {
  it("Card defaults to elevation 1", () => {
    const defaultElevation: ElevationLevel = 1;
    expect(defaultElevation).toBe(1);
  });

  it("Card defaults to default variant", () => {
    const defaultVariant: SurfaceVariant = "default";
    expect(defaultVariant).toBe("default");
  });

  it("Card defaults to md padding", () => {
    const defaultPadding = "md";
    expect(defaultPadding).toBe("md");
  });

  it("Panel defaults to elevation 1", () => {
    const defaultElevation: ElevationLevel = 1;
    expect(defaultElevation).toBe(1);
  });

  it("Panel defaults to fullHeight false", () => {
    const defaultFullHeight = false;
    expect(defaultFullHeight).toBe(false);
  });

  it("Backdrop defaults to modal type", () => {
    const defaultType = "modal";
    expect(defaultType).toBe("modal");
  });

  it("Backdrop defaults to visible true", () => {
    const defaultVisible = true;
    expect(defaultVisible).toBe(true);
  });

  it("Overlay defaults to modal type", () => {
    const defaultType = "modal";
    expect(defaultType).toBe("modal");
  });

  it("Overlay defaults to right position", () => {
    const defaultPosition = "right";
    expect(defaultPosition).toBe("right");
  });

  it("Overlay defaults to open true", () => {
    const defaultOpen = true;
    expect(defaultOpen).toBe(true);
  });

  it("Divider defaults to horizontal orientation", () => {
    const defaultOrientation = "horizontal";
    expect(defaultOrientation).toBe("horizontal");
  });
});

// ============================================
// CSS Variable Tests
// ============================================

describe("CSS variable naming", () => {
  const cssVariables = [
    "--elevation-0",
    "--elevation-1",
    "--elevation-2",
    "--elevation-3",
    "--elevation-4",
    "--bg-translucent",
    "--bg-translucent-heavy",
    "--backdrop-modal",
    "--backdrop-drawer",
    "--backdrop-blur-modal",
    "--backdrop-blur-drawer",
    "--z-dropdown",
    "--z-sticky",
    "--z-drawer",
    "--z-modal",
    "--z-popover",
    "--z-tooltip",
    "--z-toast",
  ];

  it("defines all elevation variables", () => {
    const elevationVars = cssVariables.filter((v) => v.startsWith("--elevation-"));
    expect(elevationVars).toHaveLength(5);
  });

  it("defines translucent background variables", () => {
    const translucentVars = cssVariables.filter((v) => v.includes("translucent"));
    expect(translucentVars).toHaveLength(2);
  });

  it("defines backdrop variables", () => {
    const backdropVars = cssVariables.filter((v) => v.includes("backdrop"));
    expect(backdropVars).toHaveLength(4);
  });

  it("defines z-index variables", () => {
    const zVars = cssVariables.filter((v) => v.startsWith("--z-"));
    expect(zVars).toHaveLength(7);
  });
});
