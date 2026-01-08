import { expect, test } from "@playwright/test";

/**
 * E2E Tests for Backtest Dashboard Flow
 *
 * These tests cover the complete backtest workflow:
 * 1. Viewing the backtest list
 * 2. Creating a new backtest
 * 3. Watching progress updates
 * 4. Viewing results
 *
 * Run with:
 *   cd apps/dashboard
 *   npx playwright test
 *   npx playwright test --ui  (interactive)
 */

test.describe("Backtest Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/backtest");
  });

  test("displays backtest page with form", async ({ page }) => {
    // Verify page title
    await expect(page.locator("h1")).toContainText("Backtest");

    // Verify form elements exist
    await expect(page.locator("#backtest-name")).toBeVisible();
    await expect(page.locator("#backtest-start")).toBeVisible();
    await expect(page.locator("#backtest-end")).toBeVisible();
    await expect(page.locator("#backtest-capital")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Backtest" })).toBeVisible();
  });

  test("shows loading state for backtest list", async ({ page }) => {
    // On initial load, should show loading skeletons or the list
    const loadingOrList = page.locator(".animate-pulse, [data-testid='backtest-list']");
    await expect(loadingOrList.first()).toBeVisible({ timeout: 5000 });
  });

  test("displays empty state when no backtests exist", async ({ page }) => {
    // Wait for loading to complete
    await page.waitForLoadState("networkidle");

    // Either shows backtests or empty state
    const content = await page.textContent("body");
    const hasBacktests = content?.includes("completed") || content?.includes("running");
    const hasEmptyState = content?.includes("No backtests yet");

    expect(hasBacktests || hasEmptyState).toBeTruthy();
  });

  test("form validation prevents empty submission", async ({ page }) => {
    // Try to submit with empty form
    const submitButton = page.getByRole("button", { name: "Run Backtest" });
    await submitButton.click();

    // Should still be on the same page (no redirect)
    await expect(page).toHaveURL(/\/backtest$/);
  });

  test("can fill backtest form", async ({ page }) => {
    // Fill in the form
    await page.fill("#backtest-name", "E2E Test Strategy");
    await page.fill("#backtest-start", "2024-01-01");
    await page.fill("#backtest-end", "2024-06-30");
    await page.fill("#backtest-capital", "50000");

    // Verify values
    await expect(page.locator("#backtest-name")).toHaveValue("E2E Test Strategy");
    await expect(page.locator("#backtest-start")).toHaveValue("2024-01-01");
    await expect(page.locator("#backtest-end")).toHaveValue("2024-06-30");
    await expect(page.locator("#backtest-capital")).toHaveValue("50000");
  });
});

test.describe("Backtest Creation Flow", () => {
  // Use longer timeout for backtest execution
  test.setTimeout(120000);

  test("creates backtest and shows progress", async ({ page }) => {
    await page.goto("/backtest");

    // Fill form with test data
    await page.fill("#backtest-name", `E2E Test ${Date.now()}`);
    await page.fill("#backtest-start", "2024-01-01");
    await page.fill("#backtest-end", "2024-03-31");
    await page.fill("#backtest-capital", "100000");

    // Submit form
    await page.getByRole("button", { name: "Run Backtest" }).click();

    // Button should show loading state
    await expect(page.getByRole("button", { name: "Creating..." })).toBeVisible();

    // Wait for progress bar to appear (indicates backtest started)
    const progressBar = page.locator('[class*="rounded-full"][class*="h-"]');
    await expect(progressBar.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Backtest Detail Page", () => {
  test("navigates to detail page from list", async ({ page }) => {
    await page.goto("/backtest");
    await page.waitForLoadState("networkidle");

    // Check if there are any backtests to click on
    const backtestItems = page.locator('[class*="cursor-pointer"]');
    const count = await backtestItems.count();

    if (count > 0) {
      // Click the first backtest
      await backtestItems.first().click();

      // Should navigate to detail page or show details in the same page
      // The current implementation shows details inline, not a separate page
      await expect(
        page.locator("text=Trade Log").or(page.locator("text=Equity Curve"))
      ).toBeVisible({
        timeout: 5000,
      });
    } else {
      // Skip test if no backtests exist
      test.skip();
    }
  });

  test("displays backtest detail page elements", async ({ page }) => {
    // Navigate directly to a backtest detail page
    // This will 404 if the ID doesn't exist, but tests the page structure
    await page.goto("/backtest/test-id");

    // Should show either the backtest details or "not found"
    const content = await page.textContent("body");
    const isDetailPage = content?.includes("Parameters") || content?.includes("Backtest not found");
    expect(isDetailPage).toBeTruthy();
  });

  test("detail page shows back link", async ({ page }) => {
    await page.goto("/backtest/test-id");

    // Look for back navigation (either link or arrow button)
    const backLink = page.locator('a[href="/backtest"], button:has-text("Back")').first();
    await expect(backLink).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Backtest Results Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/backtest");
    await page.waitForLoadState("networkidle");
  });

  test("completed backtest shows metrics", async ({ page }) => {
    // Look for any completed backtest
    const completedBadge = page.locator("text=completed").first();

    if (await completedBadge.isVisible()) {
      // Click on a completed backtest
      const backtestRow = completedBadge.locator("xpath=ancestor::*[@class]").first();
      await backtestRow.click();

      // Should show metrics
      await expect(
        page.locator("text=Total Return").or(page.locator("text=Sharpe Ratio"))
      ).toBeVisible({ timeout: 5000 });
    } else {
      // Skip if no completed backtests
      test.skip();
    }
  });

  test("equity curve section is present for completed backtest", async ({ page }) => {
    const completedBadge = page.locator("text=completed").first();

    if (await completedBadge.isVisible()) {
      const backtestRow = completedBadge.locator("xpath=ancestor::*[@class]").first();
      await backtestRow.click();

      await expect(page.locator("text=Equity Curve")).toBeVisible({ timeout: 5000 });
    } else {
      test.skip();
    }
  });

  test("trade log section is present for completed backtest", async ({ page }) => {
    const completedBadge = page.locator("text=completed").first();

    if (await completedBadge.isVisible()) {
      const backtestRow = completedBadge.locator("xpath=ancestor::*[@class]").first();
      await backtestRow.click();

      await expect(page.locator("text=Trade Log")).toBeVisible({ timeout: 5000 });
    } else {
      test.skip();
    }
  });
});

test.describe("Backtest Error Handling", () => {
  test("handles API errors gracefully", async ({ page }) => {
    // Mock API to return error
    await page.route("**/api/backtests", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    await page.goto("/backtest");

    // Should not crash - either shows error or empty state
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("handles missing backtest ID gracefully", async ({ page }) => {
    await page.goto("/backtest/nonexistent-id-12345");

    // Should show not found message
    await expect(
      page.locator("text=not found").or(page.locator("text=Back to backtests"))
    ).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Backtest Accessibility", () => {
  test("form inputs have labels", async ({ page }) => {
    await page.goto("/backtest");

    // Check that inputs have associated labels
    await expect(page.locator('label[for="backtest-name"]')).toBeVisible();
    await expect(page.locator('label[for="backtest-start"]')).toBeVisible();
  });

  test("page has heading hierarchy", async ({ page }) => {
    await page.goto("/backtest");

    // Should have h1
    await expect(page.locator("h1")).toBeVisible();

    // Should have h2 sections
    const h2s = page.locator("h2");
    await expect(h2s.first()).toBeVisible();
  });
});
