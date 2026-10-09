import { expect, test } from "@playwright/test";

test("page two is shareable and survives refresh", async ({ page }) => {
  await page.goto("/?q=react&location=Singapore");

  await page.getByRole("button", { name: "Page 2", exact: true }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBe("2");

  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole("status", { name: "Job results count" }),
  ).toHaveText("24 jobs found");

  const sharedUrl = page.url();

  await page.reload();

  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.goto("/");
  await page.goto(sharedUrl);

  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();
});

test("browser Back and Forward restore the correct page", async ({ page }) => {
  await page.goto("/?q=react&location=Singapore");

  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();

  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();

  await page.goBack();

  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();

  await page.goForward();

  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBe("2");
});

test("pagination preserves search and repeated source filters", async ({
  page,
}) => {
  await page.goto("/?q=react&source=Himalayas&source=Remote+OK&company=Acme");

  await page.getByRole("button", { name: "Next page" }).click();

  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams;

      return {
        q: params.get("q"),
        sources: params.getAll("source"),
        company: params.get("company"),
        page: params.get("page"),
      };
    })
    .toEqual({
      q: "react",
      sources: ["Himalayas", "Remote OK"],
      company: "Acme",
      page: "2",
    });

  await expect(page.getByRole("article")).toHaveCount(6);
});

test("changing search removes page and starts at page one", async ({
  page,
}) => {
  await page.goto("/?page=2");

  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page
    .getByRole("searchbox", { name: "Job title or keyword" })
    .fill("react");

  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();

  await expect(
    page.getByRole("button", { name: "Page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("applying filters removes page and starts at page one", async ({
  page,
}) => {
  await page.goto("/?page=2");

  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.getByRole("checkbox", { name: "Himalayas" }).check();
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();

  await expect(
    page.getByRole("button", { name: "Page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await expect(
    page.getByRole("status", { name: "Job results count" }),
  ).toHaveText("24 jobs found");
});

test("unchecking an applied source also resets the page", async ({ page }) => {
  await page.goto("/?q=react&source=Himalayas&page=2");

  await expect(page.getByRole("article")).toHaveCount(6);

  await page.getByRole("checkbox", { name: "Himalayas" }).uncheck();

  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams;

      return {
        page: params.get("page"),
        source: params.getAll("source"),
        q: params.get("q"),
      };
    })
    .toEqual({ page: null, source: [], q: "react" });

  await expect(page.getByRole("article")).toHaveCount(18);
});

test("clearing the keyword resets the page and keeps the location", async ({
  page,
}) => {
  await page.goto("/?q=react&location=Singapore&page=2");

  await expect(page.getByRole("article")).toHaveCount(6);

  await page.getByRole("searchbox", { name: "Job title or keyword" }).hover();

  await page
    .getByRole("button", { name: "Clear job title or keyword" })
    .click();

  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams;

      return {
        page: params.get("page"),
        q: params.get("q"),
        location: params.get("location"),
      };
    })
    .toEqual({ page: null, q: null, location: "Singapore" });

  await expect(page.getByRole("article")).toHaveCount(18);
});

test("an oversized shared page redirects to the last page", async ({
  page,
}) => {
  await page.goto("/?q=react&location=Singapore&page=999");

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBe("2");

  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
});

for (const value of ["0", "-1", "abc", "1.5", "1000001"]) {
  test(`invalid page ${value} returns to page one`, async ({ page }) => {
    await page.goto(`/?q=react&page=${encodeURIComponent(value)}`);

    await expect
      .poll(() => new URL(page.url()).searchParams.get("page"))
      .toBeNull();

    await expect(
      page.getByRole("button", { name: "Page 1", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await expect(page.getByRole("article")).toHaveCount(18);
  });
}

test("empty results on an oversized page return to page one", async ({
  page,
}) => {
  await page.goto("/?q=no-matching-job-xyz&page=999");

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();

  await expect(
    page.getByRole("status", { name: "Job results count" }),
  ).toHaveText("0 jobs found");
});

test("the mock API returns only the requested page", async ({ request }) => {
  const response = await request.get(
    "http://localhost:5010/api/jobs?q=react&location=Singapore&page=2",
  );

  expect(response.ok()).toBe(true);

  const data = await response.json();

  expect(data.total).toBe(24);
  expect(data.page).toBe(2);
  expect(data.pageSize).toBe(18);
  expect(data.totalPages).toBe(2);
  expect(data.jobs).toHaveLength(6);
  expect(data.jobs[0].title).toBe("React Developer 19");
});
