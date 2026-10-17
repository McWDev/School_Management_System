import { expect, test, type Locator } from "@playwright/test";
import pg from "pg";

/*
 * School Staff journey as the demo School Admin (storage state from auth.setup).
 * Uses unique names per run so repeated runs don't collide.
 */
test.describe.configure({ mode: "serial" });

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const run = Date.now().toString(36).slice(-5);

/** Fill the required staff fields other than name and work type. */
async function fillRequired(form: Locator) {
  await form.getByLabel("Phone").fill("+252 61 000 0000");
  await form.getByLabel("Gender").selectOption("male");
  await form.getByLabel("Date of birth").fill("1990-01-01");
  await form.getByLabel("Location").fill("Test district");
  await form.getByLabel("Hire date").fill("2020-01-01");
}
const workType = `Nurse ${run}`;
const fullName = `Asha Warsame ${run}`;
const loginName = `Omar Login ${run}`;
const loginUser = `omar.${run}`;
const loginPassword = "omar staff pass 1";

// Test-only cleanup: staff records are never deleted by the app itself.
test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("delete from staff where full_name = any($1)", [[fullName, loginName]]);
    await client.query("delete from work_types where name = $1", [workType]);
    await client.query("delete from users where username = $1", [loginUser]);
  } finally {
    await client.end();
  }
});

test("add a work type and a staff member with photo and details", async ({ page, isMobile }) => {
  test.skip(isMobile, "The full form is exercised on desktop.");
  await page.goto("/staff");
  await expect(page.getByRole("heading", { level: 1, name: "School Staff" })).toBeVisible();

  // Work types: starter list is there; add our own.
  await page.getByRole("button", { name: "Work types" }).click();
  const types = page.getByRole("dialog");
  await expect(types.getByText("Security Guard")).toBeVisible();
  await types.getByLabel("Add a work type").fill(workType);
  await types.getByRole("button", { name: "Add" }).click();
  await expect(types.getByRole("list", { name: "Work types" }).getByText(workType)).toBeVisible();
  await page.keyboard.press("Escape");

  // Add a staff member.
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog");
  await form
    .getByLabel("Photo")
    .setInputFiles({ name: "asha.png", mimeType: "image/png", buffer: PNG });
  await form.getByLabel("Full name").fill(fullName);
  await form.getByLabel("Work type").selectOption({ label: workType });
  await form.getByLabel("Phone").fill("+252 61 222 3333");
  await form.getByLabel("Email").fill(`asha.${run}@demo-hodan.example`);
  await form.getByLabel("Gender").selectOption("female");
  await form.getByLabel("Date of birth").fill("1995-03-15");
  await expect(form.getByText(/^Age: \d+$/)).toBeVisible();
  await form.getByLabel("Location").fill("Wadajir district");
  await form.getByLabel("Hire date").fill("2024-01-08");
  await form.getByLabel("Address").fill("Street 5, Mogadishu");
  await form.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const row = page.getByRole("row", { name: new RegExp(fullName) });
  await expect(row).toBeVisible();
  await expect(row.getByText(workType)).toBeVisible();
  await expect(row.getByText("Wadajir district")).toBeVisible();
  await expect(row.getByText(/Female · \d+ yrs/)).toBeVisible();
  await expect(row.getByText("Active")).toBeVisible();

  // The photo is served privately to this signed-in admin.
  const src = await row.locator("img").first().getAttribute("src");
  expect(src).toMatch(/^\/api\/staff-photo\//);
  expect((await page.request.get(src!)).status()).toBe(200);
});

test("required fields are validated", async ({ page, isMobile }) => {
  test.skip(isMobile, "Covered on desktop.");
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Add staff member" }).click();
  for (const message of [
    "Enter the full name.",
    "Choose a work type.",
    "Enter the phone number.",
    "Choose a gender.",
    "Enter the date of birth.",
    "Enter the location.",
    "Enter the hire date.",
  ]) {
    await expect(form.getByText(message)).toBeVisible();
  }
});

test("filter by work type, mark as left, and protect work types in use", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Covered on desktop.");
  await page.goto("/staff");
  await page.getByLabel("Work type", { exact: true }).selectOption({ label: workType });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("row")).toHaveCount(2); // header + Asha

  const row = page.getByRole("row", { name: new RegExp(fullName) });
  await row.getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Status").selectOption("left");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByText("Left", { exact: true })).toBeVisible();

  // A work type in use cannot be removed.
  await page.getByRole("button", { name: "Work types" }).click();
  await expect(page.getByRole("button", { name: `Remove ${workType}` })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Move Asha to another work type, then the custom one can be removed.
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Work type").selectOption({ label: "Teacher" });
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Work types" }).click();
  await page.getByRole("button", { name: `Remove ${workType}` }).click();
  await expect(
    page.getByRole("list", { name: "Work types" }).getByText(workType, { exact: true }),
  ).toHaveCount(0);
});

test("staff photos are not public", async ({ request }) => {
  const anonymous = await request.get("/api/staff-photo/00000000-0000-4000-8000-000000000000", {
    headers: { cookie: "" },
  });
  expect(anonymous.status()).toBe(404);
});

test("a staff member with login access is blocked as soon as they are Inactive", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Covered on desktop.");
  // Admin gives the staff member a username and password.
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Full name").fill(loginName);
  await form.getByLabel("Work type").selectOption({ label: "Driver" });
  await fillRequired(form);
  await form.getByLabel("Username").fill(loginUser);
  await form.getByLabel("Password", { exact: true }).fill(loginPassword);
  await form.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("row", { name: new RegExp(loginName) });
  await expect(row.getByText(`Login: ${loginUser}`)).toBeVisible();

  // The staff member signs in with the username and sees only the Dashboard.
  const staffContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const staffPage = await staffContext.newPage();
  await staffPage.goto("/login");
  await staffPage.getByLabel("Email or username").fill(loginUser);
  await staffPage.getByLabel("Password").fill(loginPassword);
  await staffPage.getByRole("button", { name: "Sign in" }).click();
  await expect(staffPage).toHaveURL(/\/dashboard$/);
  const nav = staffPage.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();

  // Admin marks them Inactive: they are signed out and cannot sign in again.
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Status").selectOption("inactive");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();

  await staffPage.reload();
  await expect(staffPage).toHaveURL(/\/login/);
  await staffPage.getByLabel("Email or username").fill(loginUser);
  await staffPage.getByLabel("Password").fill(loginPassword);
  await staffPage.getByRole("button", { name: "Sign in" }).click();
  await expect(staffPage.getByText("Your account is disabled")).toBeVisible();
  await staffContext.close();
});

test("staff younger than 15 are refused", async ({ page, isMobile }) => {
  test.skip(isMobile, "Covered on desktop.");
  const d = new Date();
  d.setFullYear(d.getFullYear() - 14);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Full name").fill("Too Young");
  await form.getByLabel("Work type").selectOption({ label: "Cleaner" });
  // Typing bypasses the date picker limit; the server still refuses it.
  await form.getByLabel("Date of birth").fill(d.toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Add staff member" }).click();
  await expect(form.getByText("Staff must be at least 15 years old.")).toBeVisible();
});

test("hire date cannot be in the future", async ({ page, isMobile }) => {
  test.skip(isMobile, "Covered on desktop.");
  const d = new Date();
  d.setDate(d.getDate() + 3);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Full name").fill("Future Hire");
  await form.getByLabel("Work type").selectOption({ label: "Cleaner" });
  await form.getByLabel("Hire date").fill(d.toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Add staff member" }).click();
  await expect(form.getByText("Hire date cannot be in the future.")).toBeVisible();
});

test("delete an unwanted staff member after confirming", async ({ page, isMobile }) => {
  test.skip(isMobile, "Covered on desktop.");
  const name = `Delete Me ${run}`;
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Full name").fill(name);
  await form.getByLabel("Work type").selectOption({ label: "Cook" });
  await fillRequired(form);
  await form.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByText("This cannot be undone.", { exact: false })).toBeVisible();
  await confirm.getByRole("button", { name: "Delete staff member" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
});
