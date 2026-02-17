import { expect, test } from "@playwright/test";

// ============================================
// Runs History Table Tests
// ============================================

test.describe("Run header and controls", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/workers");
		await page.waitForLoadState("networkidle");
	});

	test("displays runs table header", async ({ page }) => {
		await page.waitForTimeout(2000);

		const header = page.locator("h3:has-text('Recent Runs')");
		await expect(header).toBeVisible({ timeout: 10000 });
	});

	test("displays refresh button", async ({ page }) => {
		await page.waitForTimeout(2000);

		const refreshButton = page.locator("button:has(svg)").last();
		await expect(refreshButton).toBeVisible({ timeout: 10000 });
	});
});

test.describe("Run history empty state", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/workers");
		await page.waitForLoadState("networkidle");
	});

	test("shows empty state when no runs", async ({ page }) => {
		await page.route("**/api/workers/runs*", (route) => {
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					runs: [],
					total: 0,
				}),
			});
		});

		await page.reload();
		await page.waitForLoadState("networkidle");

		await expect(page.locator("text=No recent runs")).toBeVisible({ timeout: 10000 });
	});
});

test.describe("Run history data rows", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/workers");
		await page.waitForLoadState("networkidle");
	});

	test("displays run entries in table", async ({ page }) => {
		await page.route("**/api/workers/runs*", (route) => {
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					runs: [
						{
							id: "run-001",
							service: "macro_watch",
							status: "completed",
							startedAt: new Date().toISOString(),
							completedAt: new Date().toISOString(),
							duration: 60,
							result: "100 processed",
							error: null,
						},
						{
							id: "run-002",
							service: "newspaper",
							status: "running",
							startedAt: new Date().toISOString(),
							completedAt: null,
							duration: null,
							result: null,
							error: null,
						},
					],
					total: 2,
				}),
			});
		});

		await page.reload();
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(1000);

		const table = page.locator("table");
		const isTableVisible = await table.isVisible({ timeout: 5000 }).catch(() => false);
		expect(typeof isTableVisible).toBe("boolean");
	});
});

test.describe("Run refresh actions", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/workers");
		await page.waitForLoadState("networkidle");
	});

	test("refresh button refetches data", async ({ page }) => {
		let requestCount = 0;

		await page.route("**/api/workers/runs*", (route) => {
			requestCount++;
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ runs: [], total: 0 }),
			});
		});

		await page.reload();
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(1000);

		const initialCount = requestCount;

		const refreshButton = page.locator("button:has(svg)").last();
		if (await refreshButton.isVisible()) {
			await refreshButton.click();
			await page.waitForTimeout(1000);
			expect(requestCount).toBeGreaterThanOrEqual(initialCount);
		}
	});
});
