import { expect, test, type Page } from "@playwright/test";

const application = {
  id: "application-browser-test",
  jobId: "job-browser-test",
  title: "Frontend Engineer",
  company: "Example",
  url: "https://example.com/jobs/browser-test",
  status: "applied",
  notes: "",
  appliedAt: "2026-10-11T01:00:00.000Z",
  updatedAt: "2026-10-11T01:00:00.000Z",
};

async function mockAccountApis(page: Page) {
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "browser-test-user" },
      }),
    });
  });

  await page.route("**/api/saved-jobs**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [] }),
    });
  });
}

test.describe("signed-out application flow", () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [],
    },
  });

  test("shows the signed-out Application page", async ({ page }) => {
    await page.goto("/tracker");

    await expect(
      page.getByRole("heading", {
        name: "Your applications, in one place",
      }),
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("asks after returning from a listing and dismisses with Not yet", async ({
    page,
    context,
  }) => {
    await context.route("https://example.com/jobs/**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<html><body><h1>Original job listing</h1></body></html>",
      });
    });

    await page.goto("/");

    const link = page
      .getByRole("link", {
        name: /opens in a new tab/,
      })
      .first();

    await expect(link).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;

    await popup.waitForLoadState();
    await popup.bringToFront();

    // Exercise the provider's return event deterministically.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
    });

    await page.bringToFront();

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await expect(
      page.getByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Not yet" }).click();

    await expect(
      page.getByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).toHaveCount(0);

    await popup.close();
  });
});

test.describe("signed-in tracker controls", () => {
  test.use({
    storageState: process.env.PLAYWRIGHT_AUTH_STATE,
  });

  test.skip(
    !process.env.PLAYWRIGHT_AUTH_STATE,
    "Requires a test-account storage state in PLAYWRIGHT_AUTH_STATE",
  );

  test.beforeEach(async ({ page }) => {
    await mockAccountApis(page);

    await page.route("**/api/applications**", async (route) => {
      const method = route.request().method();

      if (method === "DELETE") {
        await route.fulfill({ status: 204 });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          applications: [application],
        }),
      });
    });

    await page.goto("/tracker");

    await expect(
      page.getByRole("heading", {
        name: application.title,
      }),
    ).toBeVisible();
  });

  test("opens the native dialog and Escape cancels deletion", async ({
    page,
  }) => {
    const deleteButton = page.getByRole("button", {
      name: "Remove Frontend Engineer at Example from tracker",
    });

    await deleteButton.click();

    const dialog = page.getByRole("dialog", {
      name: "Remove application?",
    });

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible();
    await expect(deleteButton).toBeFocused();

    await expect(
      page.getByRole("heading", {
        name: application.title,
      }),
    ).toBeVisible();
  });

  test("keeps keyboard focus within the confirmation dialog", async ({
    page,
  }) => {
    await page
      .getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      })
      .click();

    const dialog = page.getByRole("dialog");

    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press("Tab");

      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
  });

  test("keeps notes fixed-height with internal scrolling", async ({ page }) => {
    const notes = page.getByRole("textbox", {
      name: "Personal notes",
    });

    const before = await notes.evaluate(
      (element) => element.getBoundingClientRect().height,
    );

    await notes.fill(
      Array.from(
        { length: 40 },
        (_, index) => `Interview note ${index + 1}`,
      ).join("\n"),
    );

    const styles = await notes.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      resize: getComputedStyle(element).resize,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));

    expect(styles.height).toBe(before);
    expect(styles.resize).toBe("none");
    expect(styles.overflowY).toBe("auto");
    expect(styles.scrollHeight).toBeGreaterThan(styles.clientHeight);
  });
});
