import { expect, test } from "@playwright/test";

test("root redirects to the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page).toHaveTitle("Dashboard · School Management System");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
});

test("dashboard shows no fabricated metrics", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByLabel("Active Students: no data")).toBeVisible();
  await expect(page.getByText("No payments recorded yet")).toBeVisible();
});

test("the sidebar shows only the Dashboard tab", async ({ page, isMobile }) => {
  await page.goto("/dashboard");
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  }
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
});

test("unknown pages show a 404", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
