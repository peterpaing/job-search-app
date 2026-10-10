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

test("does not sync an account or show sync errors while signed out", async ({
  page,
}) => {
  const syncRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (url.pathname === "/api/users/me" && request.method() === "POST") {
      syncRequests.push(request.url());
    }
  });

  for (const path of ["/sign-in", "/sign-up", "/profile"]) {
    await page.goto(path);

    const heading =
      path === "/sign-up" ? "Join Dev Jobs" : "Sign in to Dev Jobs";

    await expect(page.getByText(heading, { exact: true })).toBeVisible();

    await expect(
      page.getByText(
        "We couldn’t connect your account. You can still browse jobs.",
        { exact: true },
      ),
    ).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
  }

  expect(syncRequests).toEqual([]);
});
