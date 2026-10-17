import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/* Classes journey as the demo School Admin; cleans up the classes it creates. */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const created: string[] = [];

test.afterAll(async () => {
  if (!process.env.DATABASE_URL || !created.length) return;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("delete from classes where name = any($1)", [created]);
  } finally {
    await client.end();
  }
});

test("add, edit seats, inactivate and delete a class", async ({ page, isMobile }) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  const name = `E2E ${run} A`;
  const renamed = `E2E ${run} B`;
  created.push(name, renamed);

  await page.goto("/classes");
  await expect(page.getByRole("heading", { level: 1, name: "Classes" })).toBeVisible();

  // Required fields are explained.
  await page.getByRole("button", { name: "Add class" }).click();
  let form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Add class" }).click();
  await expect(form.getByText("Enter the class name.")).toBeVisible();
  await expect(form.getByText("Enter the number of seats.")).toBeVisible();

  // Seats must be a sensible number.
  await form.getByLabel("Class name").fill(name);
  await form.getByLabel("Class seats").fill("0");
  await form.getByRole("button", { name: "Add class" }).click();
  await expect(form.getByText("A class needs at least 1 seat.")).toBeVisible();
  await form.getByLabel("Class seats").fill("40");
  await form.getByRole("button", { name: "Add class" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search by class name" }).fill(run);
  await page.getByRole("button", { name: "Apply" }).click();
  let row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Active")).toBeVisible();
  await expect(row.getByText("40 seats")).toBeVisible();

  // Duplicate names are refused.
  await page.getByRole("button", { name: "Add class" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Class name").fill(name.toLowerCase());
  await form.getByLabel("Class seats").fill("30");
  await form.getByRole("button", { name: "Add class" }).click();
  await expect(form.getByText("A class with this name already exists.").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Edit: rename and make inactive.
  await row.getByRole("button", { name: "Edit" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Class name").fill(renamed);
  await form.getByLabel("Class seats").fill("35");
  await form.getByLabel("Status").selectOption("inactive");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  row = page.getByRole("row", { name: new RegExp(renamed) });
  await expect(row.getByText("Inactive")).toBeVisible();
  await expect(row.getByText("35 seats")).toBeVisible();

  // Delete after confirming.
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete class" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row", { name: new RegExp(renamed) })).toHaveCount(0);
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("can view classes but not change them", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/classes");
    await expect(page.getByRole("heading", { level: 1, name: "Classes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add class" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });
});
