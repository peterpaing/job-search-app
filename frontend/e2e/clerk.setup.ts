import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup("configure Clerk development testing", async () => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  const email = process.env.E2E_CLERK_USER_EMAIL?.trim();

  if (!publishableKey.startsWith("pk_test_")) {
    throw new Error(
      "Browser tests require a Clerk development publishable key.",
    );
  }

  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Browser tests require a Clerk development secret key.");
  }

  if (!email || !email.includes("+clerk_test")) {
    throw new Error(
      "Set E2E_CLERK_USER_EMAIL to your dedicated +clerk_test development user.",
    );
  }

  await clerkSetup();
});
