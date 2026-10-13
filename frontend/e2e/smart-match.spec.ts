import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`SmartMatch preview stays private and fits ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const privateRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/smart-match")) {
        privateRequests.push(request.url());
      }
    });
    await page.goto("/smart-match");
    await expect(
      page.getByRole("heading", { name: "Your next role, with more clarity." }),
    ).toBeVisible();
    await expect(page.getByText("$1.99", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Payments coming soon" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("status", { name: "Loading SmartMatch" }),
    ).toHaveCount(0);
    expect(privateRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
