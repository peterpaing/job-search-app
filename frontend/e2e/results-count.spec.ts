import { expect, test } from "@playwright/test";

test("shows the total matching jobs rather than only the current page", async ({
  page,
}) => {
  await page.goto("/?q=react&location=Singapore");

  const resultsCount = page.getByRole("status", {
    name: "Job results count",
  });

  await expect(resultsCount).toHaveText("24 jobs found");
  await expect(page.getByRole("article")).toHaveCount(18);

  await page.getByRole("button", { name: "Page 2", exact: true }).click();

  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(resultsCount).toHaveText("24 jobs found");
});

test("updates the count when filters are applied", async ({ page }) => {
  await page.goto("/?q=react&location=Singapore");

  const resultsCount = page.getByRole("status", {
    name: "Job results count",
  });

  await expect(resultsCount).toHaveText("24 jobs found");

  await page.getByRole("checkbox", { name: "Himalayas" }).check();

  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill("Acme");

  await page.getByRole("combobox", { name: "Date posted" }).selectOption("1");

  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(resultsCount).toHaveText("12 jobs found");
  await expect(page.getByRole("article")).toHaveCount(12);

  await page.getByRole("button", { name: "Clear filters" }).click();

  await expect(resultsCount).toHaveText("24 jobs found");
  await expect(page.getByRole("article")).toHaveCount(18);
});

test("shows zero jobs for an unmatched search", async ({ page }) => {
  await page.goto("/?q=no-matching-job-xyz");

  await expect(
    page.getByRole("status", { name: "Job results count" }),
  ).toHaveText("0 jobs found");

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();

  await expect(page.getByRole("article")).toHaveCount(0);
});
