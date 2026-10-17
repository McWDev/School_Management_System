import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Role-based access with the synthetic demo users from `npm run db:seed`.
 * The sidebar currently shows Dashboard, Academic Year, Classes and School Staff (product owner, 2026-10-17);
 * pages are opened by URL to prove the server still enforces access.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const createdCodes: string[] = [];

// Test-only cleanup of branches created by these tests (the app archives, never deletes).
test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    // Only this run’s branches: the desktop and mobile runs execute in parallel.
    if (createdCodes.length) {
      await client.query("delete from branches where branch_code = any($1)", [createdCodes]);
    }
  } finally {
    await client.end();
  }
});

const SCHOOL_PAGES = [
  "/staff",
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
  "/academic-years",
  "/settings/branches",
  "/settings/users",
  "/settings/roles",
  "/settings/school-profile",
  "/settings/general",
];

async function expectTabs(page: Page, isMobile: boolean, tabs: string[]) {
  if (isMobile) await page.getByRole("button", { name: "Open navigation menu" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(tabs.length);
  for (const tab of tabs) await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  if (isMobile) await page.keyboard.press("Escape");
}

test("school admin sees Dashboard, Academic Year, Classes and School Staff and can open every school page", async ({
  page,
  isMobile,
}) => {
  await signInAs(page, "admin@demo-hodan.example");
  await expectTabs(page, isMobile, ["Dashboard", "Academic Year", "Classes", "School Staff"]);
  for (const path of SCHOOL_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
  }
});

test("school admin can create and archive a branch", async ({ page }) => {
  await signInAs(page, "admin@demo-hodan.example");
  await page.goto("/settings/branches");
  const code = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
  createdCodes.push(code);
  await page.getByRole("button", { name: "Add branch" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByLabel("Name").fill(`E2E Campus ${code}`);
  await dialog.getByRole("button", { name: "Create branch" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Search for it so the test does not depend on how many branches exist.
  await page.getByRole("searchbox", { name: "Search by name or code" }).fill(code);
  await page.getByRole("button", { name: "Apply" }).click();
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
  // Teachers may view classes (read-only), nothing else yet.
  await expectTabs(page, isMobile, ["Dashboard", "Classes"]);
  for (const path of [
    "/academic-years",
    "/staff",
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
  await expectTabs(page, isMobile, ["Dashboard"]);

  await page.goto("/settings/school-registrations");
  await expect(page.getByRole("row", { name: /DEMO-HODAN/ })).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DEMO-WARTA/ }).getByRole("button", { name: "Approve" }),
  ).toBeVisible();

  await page.goto("/settings/school-profile");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
