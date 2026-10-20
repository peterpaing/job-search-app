import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`public accessibility at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("loaded search results pass automated checks", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("article").first()).toBeVisible();

      if (viewport.width < 1024) {
        await page.getByRole("button", { name: "Show filters" }).click();
        await expect(
          page.getByRole("button", { name: "Hide filters" }),
        ).toBeVisible();
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test("empty search results pass automated checks", async ({ page }) => {
      await page.goto("/?q=no-matching-job-xyz");

      await expect(
        page.getByRole("heading", { name: "No jobs found." }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test("signed-out tracker passes automated checks", async ({ page }) => {
      await page.goto("/tracker");

      await expect(
        page.getByRole("heading", {
          name: "Your applications, in one place",
        }),
      ).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });
}
