import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

export async function signInTestUser(page: Page) {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL?.trim();

  if (!emailAddress) {
    throw new Error("E2E_CLERK_USER_EMAIL is missing.");
  }

  await page.goto("/");

  await clerk.signIn({
    page,
    emailAddress,
  });
}
