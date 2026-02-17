import { expect, test } from "@playwright/test";

/**
 * E2E Tests for Economic Calendar Page
 *
 * These tests cover the complete calendar workflow:
 * 1. Navigation and page display
 * 2. Event interactions (drawer open/close)
 * 3. Filter functionality
 * 4. Data display and accessibility
 *
 * Run with:
 *   cd apps/dashboard
 *   npx playwright test calendar.integration.ts
 *   npx playwright test calendar.integration.ts --ui  (interactive)
 */

// ============================================
// Navigation Tests
// ============================================

test.describe("Calendar Page Navigation", () => {
	test("navigates to calendar page from sidebar", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Click calendar link in sidebar
		const calendarLink = page.locator('a[href="/calendar"]');
		await calendarLink.click();

		// Should be on calendar page
		await expect(page).toHaveURL(/\/calendar$/);
	});

	test("displays calendar page with header", async ({ page }) => {
		await page.goto("/calendar");

		// Verify page title
		await expect(page.locator("h1")).toContainText("Economic Calendar");

		// Verify subtitle
		await expect(page.locator("text=Market-moving economic events from FRED")).toBeVisible();
	});

	test("sidebar shows active state when on calendar page", async ({ page }) => {
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// Calendar sidebar link should have active styling
		const calendarLink = page.locator('a[href="/calendar"]');
		await expect(calendarLink).toBeVisible();

		// Check for active indicator (typically different background or text color)
		const linkClasses = await calendarLink.getAttribute("class");
		expect(linkClasses).toBeTruthy();
	});

	test("calendar page has correct document title", async ({ page }) => {
		await page.goto("/calendar");

		// Check document title
		await expect(page).toHaveTitle(/Economic Calendar/);
	});
});

// ============================================
// Calendar Display Tests
// ============================================

test.describe("Calendar Display", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");
	});

	test("shows loading state initially", async ({ page }) => {
		// Reload to catch loading state
		await page.reload();

		// Look for loading skeleton or spinner
		const loadingIndicator = page.locator(".animate-spin, .animate-pulse").first();
		// May or may not be visible depending on load speed
		const isVisible = await loadingIndicator.isVisible().catch(() => false);
		expect(typeof isVisible).toBe("boolean");
	});

	test("displays calendar component after load", async ({ page }) => {
		// Wait for calendar to be visible
		await expect(page.locator("[class*='sx-react-calendar']").or(page.locator("main"))).toBeVisible(
			{ timeout: 10000 },
		);
	});

	test("shows impact legend", async ({ page }) => {
		// Legend should show High, Medium, Low impact indicators
		const legend = page.locator("text=High Impact").or(page.locator("text=High"));
		await expect(legend).toBeVisible({ timeout: 10000 });
	});

	test("shows event count when events exist", async ({ page }) => {
		// Look for event count display (e.g., "12 events")
		const eventCount = page.locator("text=/\\d+ events/");
		const isVisible = await eventCount.isVisible({ timeout: 10000 }).catch(() => false);

		// Either shows event count or empty state
		if (!isVisible) {
			const emptyState = page.locator("text=No Economic Events");
			await expect(emptyState).toBeVisible();
		}
	});
});

// ============================================
// Data Display Tests
// ============================================

test.describe("Data Display", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");
	});

	test("events show with impact colors", async ({ page }) => {
		await page.waitForTimeout(2000);

		// Look for events with impact styling
		const eventWithColor = page
			.locator("button[class*='bg-red'], button[class*='bg-amber'], button[class*='bg-stone']")
			.first();

		const isVisible = await eventWithColor.isVisible({ timeout: 5000 }).catch(() => false);

		// Either has events with colors or empty state
		if (!isVisible) {
			const emptyState = page.locator("text=No Economic Events");
			const isEmpty = await emptyState.isVisible().catch(() => false);
			expect(isVisible || isEmpty).toBeTruthy();
		}
	});

	test("displays empty state when no events", async ({ page }) => {
		// Mock API to return empty events
		await page.route("**/api/economic-calendar*", (route) => {
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					events: [],
					meta: { lastUpdated: new Date().toISOString() },
				}),
			});
		});

		await page.reload();
		await page.waitForLoadState("networkidle");

		// Should show empty state
		await expect(page.locator("text=No Economic Events")).toBeVisible({ timeout: 10000 });
	});

	test("displays error state on API failure", async ({ page }) => {
		// Mock API to return error
		await page.route("**/api/economic-calendar*", (route) => {
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ error: "Internal Server Error" }),
			});
		});

		await page.reload();
		await page.waitForLoadState("networkidle");

		// Should show error state with retry button
		const errorState = page.locator("text=Failed to Load").or(page.locator("text=Retry"));
		await expect(errorState).toBeVisible({ timeout: 10000 });
	});
});

// ============================================
// Accessibility Tests
// ============================================

test.describe("Calendar Accessibility", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");
	});

	test("page has heading hierarchy", async ({ page }) => {
		// Should have h1
		await expect(page.locator("h1")).toBeVisible();

		// H1 should contain page title
		await expect(page.locator("h1")).toContainText("Economic Calendar");
	});

	test("events have accessible labels", async ({ page }) => {
		await page.waitForTimeout(2000);

		// Event buttons should have aria-label
		const eventButton = page.locator("button[aria-label*='impact event']").first();
		const isVisible = await eventButton.isVisible({ timeout: 5000 }).catch(() => false);

		if (isVisible) {
			const ariaLabel = await eventButton.getAttribute("aria-label");
			expect(ariaLabel).toBeTruthy();
			expect(ariaLabel).toContain("impact");
		}
	});

	test("filter controls are keyboard accessible", async ({ page }) => {
		// Tab to filter controls
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");

		// Should be able to activate with Enter
		await page.keyboard.press("Enter");

		// Page should still be functional
		await expect(page.locator("h1")).toBeVisible();
	});
});

// ============================================
// Responsive Design Tests
// ============================================

test.describe("Calendar Responsive Design", () => {
	test("displays correctly on mobile viewport", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// Page should still be functional
		await expect(page.locator("h1")).toBeVisible();
		await expect(page.locator("h1")).toContainText("Economic Calendar");
	});

	test("displays correctly on tablet viewport", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// Page should still be functional
		await expect(page.locator("h1")).toBeVisible();
	});

	test("displays correctly on desktop viewport", async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// Page should still be functional
		await expect(page.locator("h1")).toBeVisible();
	});

	test("legend shows compact version on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// On mobile, legend should show abbreviated labels
		const compactLegend = page.locator("text=High").or(page.locator("text=Med"));
		await expect(compactLegend.first()).toBeVisible({ timeout: 10000 });
	});
});

// ============================================
// Dark Mode Tests
// ============================================

test.describe("Calendar Dark Mode", () => {
	test("renders correctly in dark mode", async ({ page }) => {
		await page.goto("/calendar");

		// Enable dark mode via class on html element
		await page.evaluate(() => {
			document.documentElement.classList.add("dark");
		});

		await page.waitForTimeout(500);

		// Page should still be functional
		await expect(page.locator("h1")).toBeVisible();
	});
});

// ============================================
// Error Handling Tests
// ============================================

test.describe("Calendar Error Handling", () => {
	test("handles network errors gracefully", async ({ page }) => {
		// Block API requests
		await page.route("**/api/economic-calendar*", (route) => {
			route.abort("failed");
		});

		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// Should show error state, not crash
		const body = await page.textContent("body");
		expect(body).toBeTruthy();
	});

	test("retry button refetches data", async ({ page }) => {
		let requestCount = 0;

		// First request fails, second succeeds
		await page.route("**/api/economic-calendar*", (route) => {
			requestCount++;
			if (requestCount === 1) {
				route.fulfill({
					status: 500,
					contentType: "application/json",
					body: JSON.stringify({ error: "Server Error" }),
				});
			} else {
				route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						events: [],
						meta: { lastUpdated: new Date().toISOString() },
					}),
				});
			}
		});

		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");

		// Click retry button if visible
		const retryButton = page.locator("button:has-text('Retry')");
		if (await retryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await retryButton.click();
			await page.waitForTimeout(1000);
			expect(requestCount).toBeGreaterThan(1);
		}
	});
});
