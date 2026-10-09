import { expect, test, type Page } from "@playwright/test";

function keywordInput(page: Page) {
  return page.getByRole("searchbox", {
    name: "Job title or keyword",
  });
}

function locationInput(page: Page) {
  return page.getByRole("textbox", {
    name: "Country or city",
  });
}

function cards(page: Page) {
  return page.getByRole("article");
}

async function expectQuery(
  page: Page,
  expected: Record<string, string | string[] | null>,
) {
  await expect
    .poll(() => {
      const params = new URL(page.url()).searchParams;
      const values: Record<string, string | string[] | null> = {};

      for (const [key, expectedValue] of Object.entries(expected)) {
        values[key] = Array.isArray(expectedValue)
          ? params.getAll(key)
          : params.get(key);
      }

      return values;
    })
    .toEqual(expected);
}

test("search updates the URL and displayed jobs", async ({ page }) => {
  await page.goto("/");

  await keywordInput(page).fill("react");
  await locationInput(page).fill("Singapore");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expectQuery(page, {
    q: "react",
    location: "Singapore",
  });

  await expect(cards(page)).toHaveCount(18);
  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Page 2", exact: true }).click();

  await expect(cards(page)).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();
});

test("applying sidebar filters changes the results", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("checkbox", { name: "Himalayas" }).check();
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill("Acme");
  await page.getByRole("combobox", { name: "Date posted" }).selectOption("1");
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expectQuery(page, {
    source: ["Himalayas"],
    company: "Acme",
    postedWithin: "1",
  });

  await expect(cards(page)).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "Clear filters" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Job pagination" }),
  ).toHaveCount(0);
});

test("a shared URL restores search, filters and results", async ({ page }) => {
  const query = new URLSearchParams({
    q: "react",
    location: "Singapore",
    source: "Himalayas",
    company: "Acme",
    postedWithin: "1",
  });

  await page.goto(`/?${query.toString()}`);

  await expect(keywordInput(page)).toHaveValue("react");
  await expect(locationInput(page)).toHaveValue("Singapore");
  await expect(page.getByRole("checkbox", { name: "Himalayas" })).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Company", exact: true }),
  ).toHaveValue("Acme");
  await expect(page.getByRole("combobox", { name: "Date posted" })).toHaveValue(
    "1",
  );
  await expect(cards(page)).toHaveCount(12);

  await page.reload();

  await expect(keywordInput(page)).toHaveValue("react");
  await expect(cards(page)).toHaveCount(12);
});

test("the keyword cross immediately refreshes results and preserves filters", async ({
  page,
}) => {
  await page.goto("/?q=node&source=Himalayas&company=Acme");

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();

  await keywordInput(page).hover();
  await page
    .getByRole("button", { name: "Clear job title or keyword" })
    .click();

  await expectQuery(page, {
    q: null,
    source: ["Himalayas"],
    company: "Acme",
  });

  await expect(keywordInput(page)).toHaveValue("");
  await expect(cards(page)).toHaveCount(18);
  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();
});

test("clearing filters preserves the keyword and location", async ({
  page,
}) => {
  await page.goto(
    "/?q=node&location=Malaysia&source=Himalayas&company=Acme&postedWithin=1",
  );

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();

  await expectQuery(page, {
    q: "node",
    location: "Malaysia",
    source: [],
    company: null,
    postedWithin: null,
  });

  await expect(keywordInput(page)).toHaveValue("node");
  await expect(locationInput(page)).toHaveValue("Malaysia");
  await expect(cards(page)).toHaveCount(12);
  await expect(
    page.getByRole("heading", { name: "Backend Developer 1", exact: true }),
  ).toBeVisible();
});

test("applying filters resets pagination to page one", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Page 2", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "Himalayas" }).check();
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expectQuery(page, {
    source: ["Himalayas"],
  });

  await expect(
    page.getByRole("button", { name: "Page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toHaveCount(0);
});

test("changing search resets pagination to page one", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Page 2", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "React Developer 19", exact: true }),
  ).toBeVisible();

  await keywordInput(page).fill("react");
  await locationInput(page).fill("Singapore");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expectQuery(page, {
    q: "react",
    location: "Singapore",
  });

  await expect(
    page.getByRole("button", { name: "Page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();
});

test("shows the styled empty state for an unmatched search", async ({
  page,
}) => {
  await page.goto("/");

  await keywordInput(page).fill("no-matching-job-xyz");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expectQuery(page, {
    q: "no-matching-job-xyz",
  });

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Try a different keyword, broaden your location, or remove some filters.",
    ),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Job pagination" }),
  ).toHaveCount(0);
});

test("the location cross immediately refreshes results and preserves other criteria", async ({
  page,
}) => {
  await page.goto("/?q=react&location=Germany&source=Himalayas");

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();

  await locationInput(page).hover();
  await page.getByRole("button", { name: "Clear country or city" }).click();

  await expectQuery(page, {
    q: "react",
    location: null,
    source: ["Himalayas"],
  });

  await expect(locationInput(page)).toHaveValue("");
  await expect(keywordInput(page)).toHaveValue("react");
  await expect(cards(page)).toHaveCount(18);
  await expect(
    page.getByRole("heading", { name: "React Developer 1", exact: true }),
  ).toBeVisible();
});

test("unchecking an applied source immediately refreshes results", async ({
  page,
}) => {
  await page.goto("/?q=node&location=Malaysia&source=Himalayas");

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "Himalayas" }).uncheck();

  await expectQuery(page, {
    q: "node",
    location: "Malaysia",
    source: [],
  });

  await expect(cards(page)).toHaveCount(12);
  await expect(
    page.getByRole("heading", { name: "Backend Developer 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply filters" }),
  ).toBeVisible();
});

test("unchecking one source preserves the other applied source", async ({
  page,
}) => {
  await page.goto("/?q=react&source=Himalayas&source=Remote+OK");

  await expect(cards(page)).toHaveCount(18);

  await page.getByRole("checkbox", { name: "Himalayas" }).uncheck();

  await expectQuery(page, {
    q: "react",
    source: ["Remote OK"],
  });

  await expect(
    page.getByRole("heading", { name: "No jobs found." }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Remote OK" })).toBeChecked();

  await page.getByRole("checkbox", { name: "Remote OK" }).uncheck();

  await expectQuery(page, {
    q: "react",
    source: [],
  });

  await expect(cards(page)).toHaveCount(18);
});
