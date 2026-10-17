import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/*
 * Role-based access with the synthetic demo users from `npm run db:seed`.
 * The sidebar currently shows only Dashboard (product owner, 2026-10-17);
 * pages are opened by URL to prove the server still enforces access.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SCHOOL_PAGES = [
  "/classes",
  "/students",
  "/teachers",
  "/courses",
  "/exams",
  "/attendance",
  "/timetable",
  "/fees",
  "/fees/payments",
  "/reports",
  "/settings/academic-years",
  "/settings/branches",
  "/settings/users",
  "/settings/roles",
  "/settings/school-profile",
  "/settings/general",
];

async function expectOnlyDashboardTab(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Open navigation menu" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  if (isMobile) await page.keyboard.press("Escape");
}

test("school admin sees only Dashboard in the sidebar but can open every school page", async ({
  page,
  isMobile,
}) => {
  await signInAs(page, "admin@demo-hodan.example");
  await expectOnlyDashboardTab(page, isMobile);
  for (const path of SCHOOL_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
  }
});

test("school admin can create and archive a branch", async ({ page }) => {
  await signInAs(page, "admin@demo-hodan.example");
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

test("teacher is refused admin pages on the server", async ({ page, isMobile }) => {
  await signInAs(page, "teacher@demo-hodan.example");
  await expectOnlyDashboardTab(page, isMobile);
  for (const path of [
    "/settings/users",
    "/settings/branches",
    "/settings/roles",
    "/settings/school-profile",
    "/settings/school-registrations",
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

test("platform admin manages schools on School Registrations only", async ({ page, isMobile }) => {
  await signInAs(page, "platform.admin@sms.example");
  await expect(page.getByText("Platform administration").first()).toBeVisible();
  await expectOnlyDashboardTab(page, isMobile);

  await page.goto("/settings/school-registrations");
  await expect(page.getByRole("row", { name: /DEMO-HODAN/ })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DEMO-WARTA/ }).getByRole("button", { name: "Approve" }),
  ).toBeVisible();

  await page.goto("/settings/school-profile");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
