# Visual Regression Tests

Visual regression tests using Playwright to detect unintended visual changes in design system components.

## Overview

These tests capture screenshots of components and compare against baseline images.
Any visual differences are flagged for review.

## Running Tests

```bash
# Run all visual tests
bun test:visual

# Update baseline screenshots (after intentional changes)
bun test:visual:update

# View test report
bun test:visual:report
```

## Test Structure

```
tests/visual/
├── __screenshots__/           # Baseline screenshots (committed to git)
│   ├── chromium-light/        # Light mode baselines
│   ├── chromium-dark/         # Dark mode baselines
│   └── mobile-light/          # Mobile viewport baselines
├── components.spec.ts         # Component visual tests
└── README.md                  # This file
```

## Adding New Tests

1. Add test in `components.spec.ts`:
   ```typescript
   test("my new component", async ({ page }) => {
     await navigateToStory(page, "components-mycomponent--default");
     await expect(page.locator("#storybook-root")).toHaveScreenshot(
       "my-component-default.png"
     );
   });
   ```

2. Generate baseline: `bun test:visual:update`

3. Commit baseline screenshots

## Storybook Integration

Tests expect components to be available in Storybook at `http://localhost:6006`.

Story IDs follow the pattern: `{category}-{component}--{variant}`

Examples:
- `components-button--primary`
- `components-statusdot--active`
- `design-tokens-colors--semantic`

## CI Integration

Visual regression tests run on PRs that modify:
- `apps/dashboard/src/components/**`
- `apps/dashboard/src/styles/**`

Failed tests upload diff artifacts for review.

## Updating Baselines

After intentional visual changes:

1. Run `bun test:visual:update` to regenerate baselines
2. Review the changes in `__screenshots__/`
3. Commit the updated baselines

## Configuration

See `playwright.config.ts` for:
- Screenshot comparison thresholds
- Browser/viewport configurations
- Light/dark mode projects
