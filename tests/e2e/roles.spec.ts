import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/*
 * Role-based UI (Task 06) with the synthetic demo users from `npm run db:seed`.
 * Hiding navigation is only convenience: these tests also open pages directly
 * to prove the server refuses them.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function openNav(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Open navigation menu" }).click();
  return page.getByRole("navigation", { name: "Main navigation" });
}

test("school admin sees settings and can create and archive a branch", async ({
  page,
  isMobile,
}) => {
  await signInAs(page, "admin@demo-hodan.example");
  await expect(page.getByText("Hodan Demo School").first()).toBeVisible();
  const nav = await openNav(page, isMobile);
  for (const item of [
    "Users",
    "Branches",
    "Roles & Permissions",
    "School Profile",
    "School Fees",
  ]) {
    await expect(nav.getByRole("link", { name: item })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "School Registrations" })).toHaveCount(0);

  await page.goto("/settings/branches");
  const code = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await page.getByRole("button", { name: "Add branch" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByLabel("Name").fill(`E2E Campus ${code}`);
  await dialog.getByRole("button", { name: "Create branch" }).click();
  const row = page.getByRole("row", { name: new RegExp(code) });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive branch" }).click();
  await expect(row.getByText("Archived")).toBeVisible();
});

test("school admin sees users with their roles", async ({ page, isMobile }) => {
  await signInAs(page, "admin@demo-hodan.example");
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
  const teacherRow = page.getByRole("row", { name: /teacher@demo-hodan\.example/ });
  await expect(teacherRow.getByText("Teacher", { exact: true })).toBeVisible();
  // The Branches column is hidden on small screens.
  if (!isMobile) await expect(teacherRow.getByText("Main Campus", { exact: true })).toBeVisible();
});

test("teacher only sees what a teacher needs", async ({ page, isMobile }) => {
  await signInAs(page, "teacher@demo-hodan.example");
  const nav = await openNav(page, isMobile);
  await expect(nav.getByRole("link", { name: "Attendance" })).toBeVisible();
  for (const hidden of [
    "Users",
    "Branches",
    "School Fees",
    "Roles & Permissions",
    "School Profile",
  ]) {
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  }
  // Direct URLs are refused on the server too.
  for (const path of [
    "/settings/users",
    "/settings/branches",
    "/settings/roles",
    "/settings/school-profile",
  ]) {
    await page.goto(path);
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  }
});

test("branch admin sees only their branch", async ({ page }) => {
  await signInAs(page, "north.admin@demo-hodan.example");
  await page.goto("/settings/branches");
  await expect(page.getByRole("cell", { name: "North Campus" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Main Campus" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add branch" })).toHaveCount(0);
});

test("platform admin manages school registrations on School Profile", async ({
  page,
  isMobile,
}) => {
  await signInAs(page, "platform.admin@sms.example");
  await expect(page.getByText("Platform administration").first()).toBeVisible();
  const nav = await openNav(page, isMobile);
  await expect(nav.getByRole("link", { name: "School Profile" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Students" })).toHaveCount(0);

  await page.goto("/settings/school-registrations");
  await expect(page).toHaveURL(/\/settings\/school-profile$/);
  await expect(page.getByRole("row", { name: /DEMO-HODAN/ })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DEMO-WARTA/ }).getByRole("button", { name: "Approve" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Register school" })).toBeVisible();
});
