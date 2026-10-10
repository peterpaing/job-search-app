import { expect, test } from "@playwright/test";

test("shows the login form on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByText("Sign in to Dev Jobs", { exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
});

test("shows the signup form without the removed recovery text", async ({
  page,
}) => {
  await page.goto("/sign-up");

  await expect(page.getByText("Join Dev Jobs", { exact: true })).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();

  await expect(
    page.getByText("Having trouble completing signup?", { exact: true }),
  ).toHaveCount(0);

  await expect(
    page.getByRole("button", { name: "Restart signup" }),
  ).toHaveCount(0);
});

test("shows login rather than account settings on signed-out Profile", async ({
  page,
}) => {
  await page.goto("/profile");

  await expect(
    page.getByText("Sign in to Dev Jobs", { exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Delete account — unavailable" }),
  ).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "Account settings" }),
  ).toHaveCount(0);
});

test("recovers to signup when Back restores a stale protect-check entry", async ({
  page,
}) => {
  await page.goto("/sign-up");

  await expect(page.getByText("Join Dev Jobs", { exact: true })).toBeVisible();

  // Simulate stale signup history without submitting an account.
  // Preserve Next.js history metadata.
  await page.evaluate(() => {
    window.history.pushState(
      window.history.state,
      "",
      "/sign-up/protect-check",
    );

    window.history.pushState(
      window.history.state,
      "",
      "/sign-up/verify-email-address",
    );
  });

  await expect(page).toHaveURL(/\/sign-up\/verify-email-address$/);

  // Equivalent history traversal to pressing browser Back.
  await page.evaluate(() => {
    window.history.back();
  });

  await expect(page).toHaveURL(/\/sign-up$/);

  await expect(page.getByText("Join Dev Jobs", { exact: true })).toBeVisible();
});
