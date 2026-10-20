import { expect, test } from "@playwright/test";

test("search and filter controls show solid keyboard-focus outlines", async ({
  page,
}) => {
  await page.goto("/");

  // Establish keyboard navigation before inspecting focus styles.
  await page.keyboard.press("Tab");

  const controls = [
    page.getByRole("searchbox", { name: "Job title or keyword" }),
    page.getByRole("textbox", { name: "Country or city" }),
    page.getByRole("checkbox", { name: "Remote OK", exact: true }),
    page.getByRole("textbox", { name: "Company", exact: true }),
    page.getByRole("combobox", { name: "Date posted" }),
  ];

  for (const control of controls) {
    await control.focus();

    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-width", "2px");
    await expect(control).toHaveCSS("outline-offset", "2px");
  }
});
