/**
 * Visual Regression Tests for Design System Components
 *
 * Tests capture screenshots of components and compare against baselines
 * to detect unintended visual changes.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { expect, type Page, test } from "@playwright/test";

// ============================================
// Test Helpers
// ============================================

/**
 * Navigate to a Storybook story by ID.
 */
async function navigateToStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  // Wait for story to render
  await page.waitForLoadState("networkidle");
  // Additional wait for animations to settle
  await page.waitForTimeout(100);
}

// ============================================
// Button Component Tests
// ============================================

test.describe("Button", () => {
  test("primary variant", async ({ page }) => {
    await navigateToStory(page, "components-button--primary");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("button-primary.png");
  });

  test("secondary variant", async ({ page }) => {
    await navigateToStory(page, "components-button--secondary");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("button-secondary.png");
  });

  test("destructive variant", async ({ page }) => {
    await navigateToStory(page, "components-button--destructive");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("button-destructive.png");
  });

  test("loading state", async ({ page }) => {
    await navigateToStory(page, "components-button--loading");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("button-loading.png");
  });

  test("disabled state", async ({ page }) => {
    await navigateToStory(page, "components-button--disabled");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("button-disabled.png");
  });

  test("size variants", async ({ page }) => {
    await navigateToStory(page, "components-button--sizes");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("button-sizes.png");
  });
});

// ============================================
// StatusDot Component Tests
// ============================================

test.describe("StatusDot", () => {
  test("active status", async ({ page }) => {
    await navigateToStory(page, "components-statusdot--active");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("status-dot-active.png");
  });

  test("processing status", async ({ page }) => {
    await navigateToStory(page, "components-statusdot--processing");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("status-dot-processing.png");
  });

  test("idle status", async ({ page }) => {
    await navigateToStory(page, "components-statusdot--idle");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("status-dot-idle.png");
  });

  test("error status", async ({ page }) => {
    await navigateToStory(page, "components-statusdot--error");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("status-dot-error.png");
  });

  test("all statuses with glow", async ({ page }) => {
    await navigateToStory(page, "components-statusdot--all-with-glow");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("status-dot-all-glow.png");
  });
});

// ============================================
// SystemHealthBadge Component Tests
// ============================================

test.describe("SystemHealthBadge", () => {
  test("connected state", async ({ page }) => {
    await navigateToStory(page, "components-systemhealthbadge--connected");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("health-badge-connected.png");
  });

  test("disconnected state", async ({ page }) => {
    await navigateToStory(page, "components-systemhealthbadge--disconnected");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("health-badge-disconnected.png");
  });

  test("live badge preset", async ({ page }) => {
    await navigateToStory(page, "components-systemhealthbadge--live");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("health-badge-live.png");
  });

  test("pill variant", async ({ page }) => {
    await navigateToStory(page, "components-systemhealthbadge--pill");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("health-badge-pill.png");
  });
});

// ============================================
// Input Component Tests
// ============================================

test.describe("Input", () => {
  test("default state", async ({ page }) => {
    await navigateToStory(page, "components-input--default");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("input-default.png");
  });

  test("with placeholder", async ({ page }) => {
    await navigateToStory(page, "components-input--with-placeholder");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("input-placeholder.png");
  });

  test("error state", async ({ page }) => {
    await navigateToStory(page, "components-input--error");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("input-error.png");
  });

  test("disabled state", async ({ page }) => {
    await navigateToStory(page, "components-input--disabled");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("input-disabled.png");
  });
});

// ============================================
// Skeleton Component Tests
// ============================================

test.describe("Skeleton", () => {
  test("text skeleton", async ({ page }) => {
    await navigateToStory(page, "components-skeleton--text");
    // Disable animation for consistent screenshot
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("#storybook-root")).toHaveScreenshot("skeleton-text.png");
  });

  test("card skeleton", async ({ page }) => {
    await navigateToStory(page, "components-skeleton--card");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("#storybook-root")).toHaveScreenshot("skeleton-card.png");
  });
});

// ============================================
// Toast Component Tests
// ============================================

test.describe("Toast", () => {
  test("success toast", async ({ page }) => {
    await navigateToStory(page, "components-toast--success");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("toast-success.png");
  });

  test("error toast", async ({ page }) => {
    await navigateToStory(page, "components-toast--error");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("toast-error.png");
  });

  test("warning toast", async ({ page }) => {
    await navigateToStory(page, "components-toast--warning");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("toast-warning.png");
  });
});

// ============================================
// Surface Component Tests
// ============================================

test.describe("Surface", () => {
  test("elevation levels", async ({ page }) => {
    await navigateToStory(page, "components-surface--elevations");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("surface-elevations.png");
  });

  test("interactive surface", async ({ page }) => {
    await navigateToStory(page, "components-surface--interactive");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("surface-interactive.png");
  });
});

// ============================================
// Typography Tests
// ============================================

test.describe("Typography", () => {
  test("heading variants", async ({ page }) => {
    await navigateToStory(page, "design-tokens-typography--headings");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("typography-headings.png");
  });

  test("body text variants", async ({ page }) => {
    await navigateToStory(page, "design-tokens-typography--body");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("typography-body.png");
  });

  test("monospace variants", async ({ page }) => {
    await navigateToStory(page, "design-tokens-typography--monospace");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("typography-monospace.png");
  });
});

// ============================================
// Color Palette Tests
// ============================================

test.describe("Colors", () => {
  test("semantic colors", async ({ page }) => {
    await navigateToStory(page, "design-tokens-colors--semantic");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("colors-semantic.png");
  });

  test("stone palette", async ({ page }) => {
    await navigateToStory(page, "design-tokens-colors--stone");
    await expect(page.locator("#storybook-root")).toHaveScreenshot("colors-stone.png");
  });
});
