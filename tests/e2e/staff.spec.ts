import { expect, test } from "@playwright/test";
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
const workType = `Nurse ${run}`;
const fullName = `Asha Warsame ${run}`;

// Test-only cleanup: staff records are never deleted by the app itself.
test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("delete from staff where full_name = $1", [fullName]);
    await client.query("delete from work_types where name = $1", [workType]);
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
  await expect(form.getByText("Enter the full name.")).toBeVisible();
  await expect(form.getByText("Choose a work type.")).toBeVisible();
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
