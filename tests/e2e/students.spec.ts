import { expect, test, type Locator } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Students journey as the demo School Admin. The test adds its own academic
 * year and classes (so the school's own data is untouched) and removes them,
 * with the students it registers, afterwards.
 */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const year = `E2E ${run} year`;
const smallClass = `E2E ${run} A`;
const bigClass = `E2E ${run} B`;
const first = `E2E ${run} Amina`;
const second = `E2E ${run} Bashir`;

async function withClient<T>(fn: (client: pg.Client) => Promise<T>) {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const DEMO = `(select id from tenants where school_code = 'DEMO-HODAN')`;

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    await client.query(
      `insert into academic_years (tenant_id, name, status) values (${DEMO}, $1, 'upcoming')`,
      [year],
    );
    await client.query(
      `insert into classes (tenant_id, name, seats) values (${DEMO}, $1, 1), (${DEMO}, $2, 5)`,
      [smallClass, bigClass],
    );
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    // Fee records first (they keep students from being deleted); enrollments cascade.
    const mine = `(select id from students where tenant_id = ${DEMO} and full_name like $1)`;
    const pattern = [`E2E ${run}%`];
    await client.query(
      `delete from fee_payment_allocations where payment_id in (select id from fee_payments where student_id in ${mine})`,
      pattern,
    );
    await client.query(`delete from fee_payments where student_id in ${mine}`, pattern);
    await client.query(`delete from fee_charges where student_id in ${mine}`, pattern);
    await client.query(`delete from students where tenant_id = ${DEMO} and full_name like $1`, [
      `E2E ${run}%`,
    ]);
    await client.query(`delete from classes where tenant_id = ${DEMO} and name = any($1)`, [
      [smallClass, bigClass],
    ]);
    await client.query(`delete from academic_years where tenant_id = ${DEMO} and name = $1`, [
      year,
    ]);
  });
});

async function chooseClass(form: Locator, name: string) {
  const select = form.getByRole("combobox", { name: "Class", exact: true });
  const value = await select.locator("option", { hasText: name }).getAttribute("value");
  await select.selectOption(value!);
}

async function fillStudent(form: Locator, name: string, className: string) {
  await form.getByLabel("Full name").fill(name);
  await form.getByLabel("Gender").selectOption("female");
  await form.getByLabel("Date of birth").fill("2014-03-02");
  await form.getByLabel("Academic year").selectOption({ label: year });
  await chooseClass(form, className);
  await form.getByLabel("Guardian name").fill("E2E Guardian");
  await form.getByLabel("Guardian phone").fill("+252 61 000 0000");
  await form.getByRole("combobox", { name: "Fee type" }).selectOption("full_payment");
  await form.getByLabel(/^Amount they pay/).fill("50");
  await form.getByLabel(/^Registration fee \(/).fill("10");
}

test("register, fill a class, warn about duplicates, edit and delete students", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  await page.goto("/students");
  await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();

  // Required fields are explained.
  await page.getByRole("button", { name: "Register student" }).click();
  let form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Register student" }).click();
  await expect(form.getByText("Enter the full name.")).toBeVisible();
  await expect(form.getByText("Choose a gender.")).toBeVisible();
  await expect(form.getByText("Enter the guardian's name.")).toBeVisible();
  await expect(form.getByText("Enter the guardian's phone number.")).toBeVisible();

  // The first student takes the only seat of the small class.
  await fillStudent(form, first, smallClass);
  await form.getByRole("button", { name: "Register student" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The small class is now full; the typed values are kept to pick another class.
  await page.getByRole("button", { name: "Register student" }).click();
  form = page.getByRole("dialog");
  await fillStudent(form, second, smallClass);
  await expect(form.locator("option", { hasText: `${smallClass} (full)` })).toHaveCount(1);
  await form.getByRole("button", { name: "Register student" }).click();
  await expect(
    form.getByText(`${smallClass} is full: its 1 seat is taken in ${year}.`),
  ).toBeVisible();
  await expect(form.getByLabel("Full name")).toHaveValue(second);
  await chooseClass(form, bigClass);
  await form.getByRole("button", { name: "Register student" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("searchbox", { name: "Search by name, Student ID or phone" })
    .fill(`E2E ${run}`);
  await page.getByRole("button", { name: "Apply" }).click();
  const rowsOf = (name: string) => page.getByRole("row", { name: new RegExp(name) });
  await expect(rowsOf(first)).toContainText(/STU-\d{4,}/);
  await expect(rowsOf(first)).toContainText(smallClass);
  await expect(rowsOf(second)).toContainText(bigClass);

  // Same name and date of birth: a warning first, then registered when confirmed.
  await page.getByRole("button", { name: "Register student" }).click();
  form = page.getByRole("dialog");
  await fillStudent(form, first, bigClass);
  await form.getByRole("button", { name: "Register student" }).click();
  await expect(form.getByText("Possible duplicate")).toBeVisible();
  await form.getByLabel("This is a different student. Register anyway.").check();
  await form.getByRole("button", { name: "Register student" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowsOf(first)).toHaveCount(2);

  // Edit: the student graduates.
  await rowsOf(second).getByRole("button", { name: "Edit" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Status").selectOption("graduated");
  // Partial Fee: the amount is required.
  await form.getByRole("combobox", { name: "Fee type" }).selectOption("partial_fee");
  await form.getByLabel(/^Amount they pay/).fill("");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form.getByText("Enter the amount the student pays.")).toBeVisible();
  await form.getByLabel(/^Amount they pay/).fill("15");
  await form.getByLabel("Registration fee is paid").check();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowsOf(second).getByText("Graduated")).toBeVisible();
  await expect(rowsOf(second)).toContainText(/Partial Fee · [A-Z]{3} 15.00/);
  await expect(rowsOf(second)).toContainText(/Registration [A-Z]{3} 10.00 · Paid/);

  // Filter by class.
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption({ label: smallClass });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(rowsOf(first)).toHaveCount(1);
  await expect(rowsOf(second)).toHaveCount(0);
  await page.goto(`/students?search=${encodeURIComponent(`E2E ${run}`)}`);

  // Delete the duplicate after confirming.
  await rowsOf(first).nth(1).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete student" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowsOf(first)).toHaveCount(1);
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("can view students but not register or change them", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/students");
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register student" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });
});
