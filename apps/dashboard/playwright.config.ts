/**
 * Playwright Configuration for Visual Regression Testing
 *
 * Uses screenshot comparison to detect unintended visual changes
 * in design system components.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Test directory for visual regression tests
  testDir: "./tests/visual",

  // Screenshot comparison configuration
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",

  // Parallel execution
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["html", { open: "on-failure" }]],

  // Shared settings for all projects
  use: {
    // Base URL for Storybook
    baseURL: process.env.STORYBOOK_URL || "http://localhost:6006",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Trace on failure
    trace: "on-first-retry",

    // Animation settings for consistent screenshots
    // Disable animations for deterministic snapshots
  },

  // Screenshot comparison options
  expect: {
    toHaveScreenshot: {
      // Allow 0.1% pixel difference (accounts for anti-aliasing)
      threshold: 0.1,
      // Maximum different pixels allowed
      maxDiffPixels: 50,
      // Maximum ratio of different pixels
      maxDiffPixelRatio: 0.01,
      // Animation timeout before screenshot
      animations: "disabled",
    },
  },

  // Test projects for different browsers/themes
  projects: [
    // Desktop Chromium - Light Mode
    {
      name: "chromium-light",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "light",
      },
    },
    // Desktop Chromium - Dark Mode
    {
      name: "chromium-dark",
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
      },
    },
    // Mobile viewport - Light Mode
    {
      name: "mobile-light",
      use: {
        ...devices["iPhone 14"],
        colorScheme: "light",
      },
    },
  ],

  // Storybook dev server
  webServer: {
    command: "bun run storybook",
    url: "http://localhost:6006",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
