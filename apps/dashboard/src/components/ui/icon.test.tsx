/**
 * Icon Component Tests
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Activity, Icon, IconByComponent, TrendingUp } from "./icon";

// Register happy-dom for React testing
beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

describe("Icon", () => {
  describe("rendering", () => {
    test("renders a valid icon by name", () => {
      const html = renderToString(createElement(Icon, { name: "Activity" }));
      expect(html).toContain("svg");
      expect(html).toContain("icon-activity");
    });

    test("returns null for invalid icon name", () => {
      const html = renderToString(createElement(Icon, { name: "InvalidIconName" }));
      expect(html).toBe("");
    });
  });

  describe("sizing", () => {
    test("renders xs size (14px)", () => {
      const html = renderToString(createElement(Icon, { name: "Activity", size: "xs" }));
      expect(html).toContain('width="14"');
      expect(html).toContain('height="14"');
    });

    test("renders sm size (16px)", () => {
      const html = renderToString(createElement(Icon, { name: "Activity", size: "sm" }));
      expect(html).toContain('width="16"');
      expect(html).toContain('height="16"');
    });

    test("renders md size (20px) - default", () => {
      const html = renderToString(createElement(Icon, { name: "Activity" }));
      expect(html).toContain('width="20"');
      expect(html).toContain('height="20"');
    });

    test("renders lg size (24px)", () => {
      const html = renderToString(createElement(Icon, { name: "Activity", size: "lg" }));
      expect(html).toContain('width="24"');
      expect(html).toContain('height="24"');
    });

    test("renders xl size (32px)", () => {
      const html = renderToString(createElement(Icon, { name: "Activity", size: "xl" }));
      expect(html).toContain('width="32"');
      expect(html).toContain('height="32"');
    });

    test("supports custom pixel size", () => {
      const html = renderToString(createElement(Icon, { name: "Activity", pixelSize: 48 }));
      expect(html).toContain('width="48"');
      expect(html).toContain('height="48"');
    });

    test("pixelSize overrides size variant", () => {
      const html = renderToString(
        createElement(Icon, { name: "Activity", size: "xs", pixelSize: 100 })
      );
      expect(html).toContain('width="100"');
      expect(html).toContain('height="100"');
    });
  });

  describe("color", () => {
    test("defaults to currentColor", () => {
      const html = renderToString(createElement(Icon, { name: "Activity" }));
      // Lucide uses stroke attribute for color
      expect(html).toContain('stroke="currentColor"');
    });

    test("supports custom color", () => {
      const html = renderToString(createElement(Icon, { name: "Activity", color: "#ff0000" }));
      expect(html).toContain('stroke="#ff0000"');
    });

    test("supports CSS variable color", () => {
      const html = renderToString(
        createElement(Icon, { name: "Activity", color: "var(--color-status-error)" })
      );
      expect(html).toContain('stroke="var(--color-status-error)"');
    });
  });

  describe("accessibility", () => {
    test("includes aria-label when provided", () => {
      const html = renderToString(
        createElement(Icon, { name: "Settings", ariaLabel: "Open settings" })
      );
      expect(html).toContain('aria-label="Open settings"');
      expect(html).toContain('role="img"');
    });

    test("uses icon name as default aria-label", () => {
      const html = renderToString(createElement(Icon, { name: "Activity" }));
      expect(html).toContain('aria-label="Activity"');
    });

    test("hides from screen readers when decorative", () => {
      const html = renderToString(createElement(Icon, { name: "ChevronRight", decorative: true }));
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toContain("aria-label");
    });
  });

  describe("className", () => {
    test("applies custom className", () => {
      const html = renderToString(
        createElement(Icon, { name: "Activity", className: "custom-class" })
      );
      expect(html).toContain('class="');
      expect(html).toContain("custom-class");
    });
  });

  describe("testId", () => {
    test("uses default testId based on icon name", () => {
      const html = renderToString(createElement(Icon, { name: "Activity" }));
      expect(html).toContain('data-testid="icon-activity"');
    });

    test("supports custom testId", () => {
      const html = renderToString(
        createElement(Icon, { name: "Activity", "data-testid": "custom-test-id" })
      );
      expect(html).toContain('data-testid="custom-test-id"');
    });
  });
});

describe("IconByComponent", () => {
  test("renders direct icon component", () => {
    const html = renderToString(createElement(IconByComponent, { icon: Activity }));
    expect(html).toContain("svg");
  });

  test("supports all size variants", () => {
    const html = renderToString(createElement(IconByComponent, { icon: TrendingUp, size: "lg" }));
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
  });

  test("supports custom color", () => {
    const html = renderToString(
      createElement(IconByComponent, { icon: Activity, color: "#22c55e" })
    );
    expect(html).toContain('stroke="#22c55e"');
  });

  test("supports decorative mode", () => {
    const html = renderToString(
      createElement(IconByComponent, { icon: Activity, decorative: true })
    );
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("re-exported icons", () => {
  test("Activity is exported", () => {
    expect(Activity).toBeDefined();
  });

  test("TrendingUp is exported", () => {
    expect(TrendingUp).toBeDefined();
  });
});
