import { expect, test } from "@playwright/test";

test.describe("theme switcher", () => {
  test.use({ colorScheme: "light" });

  test("switches to dark, persists across reloads, and back to light", async ({ page }) => {
    await page.goto("/dashboard");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/\bdark\b/);

    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Change theme" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
  });

  test("follows the operating system when set to System", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await context.close();
  });
});
