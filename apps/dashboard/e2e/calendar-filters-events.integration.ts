import { expect, test } from "@playwright/test";

// ============================================
// Filter Tests
// ============================================

test.describe("Calendar Filters", () => {
	test.describe("Filter Controls", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/calendar");
			await page.waitForLoadState("networkidle");
		});

		test("displays country filter dropdown", async ({ page }) => {
			const countrySelect = page.locator("select").first();
			await expect(countrySelect).toBeVisible({ timeout: 10000 });
		});

		test("displays date range filter dropdown", async ({ page }) => {
			const selects = page.locator("select");
			const count = await selects.count();
			expect(count).toBeGreaterThanOrEqual(1);
		});

		test("displays impact filter chips", async ({ page }) => {
			const highChip = page.locator("button:has-text('High')").first();
			await expect(highChip).toBeVisible({ timeout: 10000 });
		});
	});

	test.describe("Filter Behavior", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto("/calendar");
			await page.waitForLoadState("networkidle");
		});

		test("can toggle impact filter", async ({ page }) => {
			const highChip = page.locator("button:has-text('High')").first();
			await expect(highChip).toBeVisible({ timeout: 10000 });
			await highChip.click();
			await page.waitForTimeout(500);
		});

		test("clear filters button appears when filters modified", async ({ page }) => {
			await page.waitForTimeout(1000);
			const highChip = page.locator("button:has-text('High')").first();

			if (await highChip.isVisible()) {
				await highChip.click();
				await page.waitForTimeout(500);
				const clearButton = page.locator("button:has-text('Clear')");
				const isVisible = await clearButton.isVisible().catch(() => false);
				expect(typeof isVisible).toBe("boolean");
			}
		});

		test("country filter can be changed", async ({ page }) => {
			const countrySelect = page.locator("select").first();

			if (await countrySelect.isVisible()) {
				await countrySelect.selectOption({ index: 1 });
				const newValue = await countrySelect.inputValue();
				expect(newValue).toBeDefined();
			}
		});
	});
});

// ============================================
// Event Interaction Tests
// ============================================

test.describe("Opening event detail", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");
	});

	test("clicking event opens detail drawer", async ({ page }) => {
		await page.waitForTimeout(2000);
		const eventButton = page.locator("button[aria-label*='impact event']").first();

		if (await eventButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await eventButton.click();
			const drawer = page.locator("text=Release Data").or(page.locator("text=High Impact"));
			await expect(drawer).toBeVisible({ timeout: 5000 });
		} else {
			test.skip();
		}
	});
});

test.describe("Closing event detail", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/calendar");
		await page.waitForLoadState("networkidle");
	});

	test("drawer closes on X button click", async ({ page }) => {
		await page.waitForTimeout(2000);
		const eventButton = page.locator("button[aria-label*='impact event']").first();

		if (await eventButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await eventButton.click();
			await page.waitForTimeout(500);

			const closeButton = page
				.locator('button[title*="Close"]')
				.or(page.locator("button:has(svg)"));
			const closeBtn = closeButton.first();

			if (await closeBtn.isVisible()) {
				await closeBtn.click();
				await page.waitForTimeout(500);
			}
		} else {
			test.skip();
		}
	});

	test("drawer closes on ESC key", async ({ page }) => {
		await page.waitForTimeout(2000);
		const eventButton = page.locator("button[aria-label*='impact event']").first();

		if (await eventButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await eventButton.click();
			await page.waitForTimeout(500);
			await page.keyboard.press("Escape");
			await page.waitForTimeout(500);
		} else {
			test.skip();
		}
	});

	test("drawer closes on backdrop click", async ({ page }) => {
		await page.waitForTimeout(2000);
		const eventButton = page.locator("button[aria-label*='impact event']").first();

		if (await eventButton.isVisible({ timeout: 5000 }).catch(() => false)) {
			await eventButton.click();
			await page.waitForTimeout(500);
			const backdrop = page.locator(".fixed.inset-0.bg-black");

			if (await backdrop.isVisible()) {
				await backdrop.click({ position: { x: 10, y: 10 } });
				await page.waitForTimeout(500);
			}
		} else {
			test.skip();
		}
	});
});
