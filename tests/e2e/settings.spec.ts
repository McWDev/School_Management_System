import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/*
 * School Settings as the demo School Admin. The test never changes the
 * school's settings (other tests rely on the defaults): it checks the rules
 * and saves the current values unchanged.
 */

test("School Settings lists its sections and General Settings checks the rules", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  await page.goto("/dashboard");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "School Settings" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "School Settings" })).toBeVisible();
  const sections = page.getByRole("list", { name: "Settings sections" });
  for (const name of [
    "General Settings",
    "School Branches",
    "School Profile",
    "Users",
    "Roles & Permissions",
  ]) {
    await expect(sections.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  await sections.getByRole("link", { name: /^General Settings/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "General Settings" })).toBeVisible();
  const midterm = page.getByLabel(/^Midterm out of/);
  const original = await midterm.inputValue();
  // The parts must add up to 100; the total updates as you type.
  await midterm.fill(String(Number(original) + 5));
  await expect(page.getByText(/= \d+ \(must be 100\)/)).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/must add up to 100/)).toBeVisible();
  await midterm.fill(original);
  await expect(page.getByText(/= 100 ✓/)).toBeVisible();
  await expect(page.getByText(/Numbers look like [A-Z0-9]+-0001\./)).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // Each section links back to School Settings.
  await page.goto("/settings/branches");
  await page.getByRole("link", { name: "School Settings" }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
});

test.describe("other users", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a branch admin sees only School Branches", async ({ page }) => {
    await signInAs(page, "north.admin@demo-hodan.example");
    await page.goto("/settings");
    const sections = page.getByRole("list", { name: "Settings sections" });
    await expect(sections.getByRole("link")).toHaveCount(1);
    await expect(sections.getByRole("link", { name: /^School Branches/ })).toBeVisible();
    await page.goto("/settings/general");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });

  test("teachers cannot open School Settings", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/settings");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});
