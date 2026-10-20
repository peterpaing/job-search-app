import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInTestUser } from "./helpers/clerk-auth";

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
    const guestStorageKey = "dev-jobs:pending-application-visits:v2:guest";

    await context.route("https://example.com/jobs/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Original job listing</h1></body></html>",
      });
    });

    // This heading appears only after the provider is ready.
    await page.goto("/tracker");

    await expect(
      page.getByRole("heading", {
        name: "Your applications, in one place",
      }),
    ).toBeVisible();

    // Use client-side navigation so the initialized provider stays mounted.
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Explore", exact: true })
      .click();

    await expect(page).toHaveURL(/\/$/);

    const link = page
      .getByRole("link", {
        name: /^View .+ \(opens in a new tab\)$/,
      })
      .first();

    await expect(link).toBeVisible();

    const listingUrl = await link.getAttribute("href");

    if (!listingUrl) {
      throw new Error("Expected the job link to have a URL.");
    }

    const popupPromise = page.waitForEvent("popup");

    await link.click();

    const popup = await popupPromise;

    try {
      await expect(
        popup.getByRole("heading", {
          name: "Original job listing",
        }),
      ).toBeVisible();

      // Verify the real click recorded the visit before testing the return.
      await expect
        .poll(() =>
          page.evaluate(
            ({ storageKey, url }) => {
              const visits = JSON.parse(
                sessionStorage.getItem(storageKey) ?? "[]",
              ) as Array<{
                job: { url?: string };
                confirmed: boolean;
              }>;

              return visits.some(
                (visit) => visit.job.url === url && visit.confirmed === false,
              );
            },
            {
              storageKey: guestStorageKey,
              url: listingUrl,
            },
          ),
        )
        .toBe(true);

      await page.bringToFront();

      await expect
        .poll(() => page.evaluate(() => document.visibilityState))
        .toBe("visible");

      // Exercise the return-event handler deterministically in headless CI.
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });

      const question = page.getByRole("heading", {
        name: "Did you apply for this job?",
      });

      await expect(question).toBeVisible();

      await page.getByRole("button", { name: "Not yet" }).click();

      await expect(question).toHaveCount(0);

      await expect
        .poll(() =>
          page.evaluate(
            (storageKey) => sessionStorage.getItem(storageKey),
            guestStorageKey,
          ),
        )
        .toBeNull();
    } finally {
      await popup.close();
    }
  });
});

test.describe("signed-in tracker controls", () => {
  test.beforeEach(async ({ page }) => {
    await mockAccountApis(page);

    let currentApplication = { ...application };
    let removed = false;

    await page.route("**/api/applications**", async (route) => {
      const method = route.request().method();

      if (method === "DELETE") {
        removed = true;
        await route.fulfill({ status: 204 });
        return;
      }

      if (method === "PATCH") {
        const changes = route.request().postDataJSON() as {
          status?: string;
          notes?: string;
          expected?: {
            id: string;
            updatedAt: string;
          };
        };

        if (removed) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ message: "Application not found" }),
          });
          return;
        }

        if (
          changes.expected &&
          (changes.expected.id !== currentApplication.id ||
            changes.expected.updatedAt !== currentApplication.updatedAt)
        ) {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              message: "Application changed.",
              application: currentApplication,
            }),
          });
          return;
        }

        currentApplication = {
          ...currentApplication,
          status: changes.status ?? currentApplication.status,
          notes: changes.notes ?? currentApplication.notes,
          updatedAt: new Date(
            Date.parse(currentApplication.updatedAt) + 1,
          ).toISOString(),
        };

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            application: currentApplication,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          applications: removed ? [] : [currentApplication],
        }),
      });
    });

    // Register API mocks before signing in.
    await signInTestUser(page);
    await page.goto("/tracker");

    await expect(
      page.getByRole("heading", {
        name: application.title,
        exact: true,
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

  test("keeps background controls inert while the confirmation dialog is open", async ({
    page,
  }) => {
    const deleteButton = page.getByRole("button", {
      name: "Remove Frontend Engineer at Example from tracker",
    });

    await deleteButton.click();

    const dialog = page.getByRole("dialog", {
      name: "Remove application?",
    });
    const cancelButton = dialog.getByRole("button", {
      name: "Cancel",
      exact: true,
    });
    const removeButton = dialog.getByRole("button", {
      name: "Remove",
      exact: true,
    });

    await expect(dialog).toBeVisible();

    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
      true,
    );

    await expect(cancelButton).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(removeButton).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(cancelButton).toBeFocused();

    // Background controls cannot receive focus while the dialog is modal.
    await deleteButton.evaluate((element) => element.focus());
    await expect(cancelButton).toBeFocused();
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
  test("saves edited notes and status", async ({ page }) => {
    await page
      .getByRole("combobox", { name: "Application status" })
      .selectOption("interviewing");

    await page
      .getByRole("textbox", { name: "Personal notes" })
      .fill("Interview on Friday");

    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: /^\s*Saved\s*$/ }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();

    await expect(
      page.getByRole("textbox", { name: "Personal notes" }),
    ).toHaveValue("Interview on Friday");
  });

  test("preserves the draft when the backend rejects a stale save", async ({
    page,
  }) => {
    await page.route("**/api/applications**", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Application changed.",
          application: {
            ...application,
            notes: "Newer notes from another tab",
            updatedAt: "2026-10-11T02:00:00.000Z",
          },
        }),
      });
    });

    const notes = page.getByRole("textbox", {
      name: "Personal notes",
    });

    await notes.fill("My unsaved draft");

    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(
      page.getByRole("button", { name: "Use latest saved version" }),
    ).toBeVisible();

    await expect(notes).toHaveValue("My unsaved draft");

    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  test("tracker and its delete dialog pass automated accessibility checks", async ({
    page,
  }) => {
    const trackerResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(trackerResults.violations).toEqual([]);

    await page
      .getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      })
      .click();

    await expect(
      page.getByRole("dialog", { name: "Remove application?" }),
    ).toBeVisible();

    const dialogResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(dialogResults.violations).toEqual([]);
  });
});
