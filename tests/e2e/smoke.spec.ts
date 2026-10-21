import { expect, test } from "@playwright/test";

test("root redirects to the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page).toHaveTitle("Dashboard · School Management System");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), /,
  );
});

test("the sidebar shows Dashboard, Academic Year, Classes, Subjects, Students, Examinations, Student Fees and School Staff to the school admin", async ({
  page,
  isMobile,
}) => {
  await page.goto("/dashboard");
  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  }
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveText([
    "Dashboard",
    "Academic Year",
    "Classes",
    "Subjects",
    "Students",
    "Examinations",
    "Student Fees",
    "School Staff",
  ]);
  await nav.getByRole("link", { name: "School Staff" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("School Staff");
});

test("unknown pages show a 404", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
