import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/*
 * Role-based UI with the synthetic demo users from `npm run db:seed`.
 * The School Admin sees and opens every school tab; other users only see their
 * assigned tabs. Hiding a tab is convenience only: these tests also open pages
 * directly to prove the server refuses them.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SCHOOL_TABS = [
  "Dashboard",
  "Classes",
  "Students",
  "Teachers",
  "Courses / Subjects",
  "Exams",
  "Attendance",
  "Timetable",
  "School Fees",
  "Payments",
  "Reports",
  "Academic Years",
  "Branches",
  "Users",
  "Roles & Permissions",
  "School Profile",
  "General Settings",
];

async function openNav(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Open navigation menu" }).click();
  return page.getByRole("navigation", { name: "Main navigation" });
}

test("school admin sees every school tab and each one opens", async ({ page, isMobile }) => {
  await signInAs(page, "admin@demo-hodan.example");
  await expect(page.getByText("Hodan Demo School").first()).toBeVisible();
  const nav = await openNav(page, isMobile);
  for (const tab of SCHOOL_TABS) await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  await expect(nav.getByRole("link", { name: "School Registrations" })).toHaveCount(0);
  if (isMobile) await page.keyboard.press("Escape");

  // Every tab opens (no "no access" page) for the School Admin.
  const hrefs = await nav
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).getAttribute("href")!));
  for (const href of hrefs) {
    await page.goto(href);
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

test("teacher sees only the teacher tabs", async ({ page, isMobile }) => {
  await signInAs(page, "teacher@demo-hodan.example");
  const nav = await openNav(page, isMobile);
  for (const tab of ["Dashboard", "Classes", "Students", "Attendance", "Exams", "Timetable"]) {
    await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  }
  for (const hidden of [
    "Users",
    "Branches",
    "School Fees",
    "Roles & Permissions",
    "School Profile",
  ]) {
    await expect(nav.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  if (isMobile) await page.keyboard.press("Escape");
  // Direct URLs are refused on the server too.
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
  const nav = await openNav(page, isMobile);
  await expect(nav.getByRole("link", { name: "School Registrations" })).toBeVisible();
  await expect(nav.getByText("Students", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("School Profile", { exact: true })).toHaveCount(0);
  if (isMobile) await page.keyboard.press("Escape");

  await page.goto("/settings/school-registrations");
  await expect(page.getByRole("row", { name: /DEMO-HODAN/ })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DEMO-WARTA/ }).getByRole("button", { name: "Approve" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Register school" })).toBeVisible();

  await page.goto("/settings/school-profile");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
