import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Student Fees journey as the demo School Admin. The test adds its own class,
 * year, student and one monthly charge directly (it does not "Charge month",
 * which would charge the school's real students), and removes them all
 * afterwards, resetting the receipt counter so no receipt number is skipped.
 */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const name = `E2E ${run} Fees`;
const DEMO = `(select id from tenants where school_code = 'DEMO-HODAN')`;

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

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    const {
      rows: [year],
    } = await client.query(
      `insert into academic_years (tenant_id, name, status) values (${DEMO}, $1, 'upcoming') returning id`,
      [`E2E ${run} year`],
    );
    const {
      rows: [cls],
    } = await client.query(
      `insert into classes (tenant_id, name, seats) values (${DEMO}, $1, 5) returning id`,
      [`E2E ${run} class`],
    );
    const {
      rows: [student],
    } = await client.query(
      `insert into students (tenant_id, student_number, full_name, gender, date_of_birth, admission_date,
         guardian_name, guardian_phone, fee_type, fee_amount)
       values (${DEMO}, $1, $2, 'female', '2014-01-01', '2025-08-01', 'E2E Guardian', '+252 61 000 0000',
         'full_payment', 50) returning id`,
      [`E2E-${run}`, name],
    );
    await client.query(
      `insert into student_enrollments (tenant_id, student_id, class_id, academic_year_id)
       values (${DEMO}, $1, $2, $3)`,
      [student.id, cls.id, year.id],
    );
    await client.query(
      `insert into fee_charges (tenant_id, student_id, kind, month, academic_year_id, amount)
       values (${DEMO}, $1, 'monthly', '2025-09-01', $2, 50)`,
      [student.id, year.id],
    );
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    const student = `(select id from students where tenant_id = ${DEMO} and student_number = $1)`;
    const args = [`E2E-${run}`];
    await client.query(
      `delete from fee_payment_allocations where payment_id in (select id from fee_payments where student_id = ${student})`,
      args,
    );
    await client.query(`delete from fee_payments where student_id = ${student}`, args);
    await client.query(`delete from fee_charges where student_id = ${student}`, args);
    await client.query(`delete from students where id = ${student}`, args);
    await client.query(`delete from classes where tenant_id = ${DEMO} and name = $1`, [
      `E2E ${run} class`,
    ]);
    await client.query(`delete from academic_years where tenant_id = ${DEMO} and name = $1`, [
      `E2E ${run} year`,
    ]);
    // Continue numbering after the school's own last receipt.
    await client.query(
      `update fee_receipt_counters set last_number = coalesce(
         (select max(substring(receipt_number from 5)::int) from fee_payments where tenant_id = ${DEMO}), 0)
       where tenant_id = ${DEMO}`,
    );
  });
});

test("collect a part payment, print the receipt, reverse it and waive the fee", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  await page.goto(`/fees?search=${encodeURIComponent(name)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Student Fees" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText(/[A-Z]{3} 50\.00/);
  await row.getByRole("link", { name: "Collect" }).click();

  // The collect dialog opens with the student's unpaid fees.
  const form = page.getByRole("dialog");
  await expect(form.getByRole("heading", { name: `Collect payment from ${name}` })).toBeVisible();
  await form.getByRole("button", { name: "Record payment" }).click();
  await expect(form.getByText("Choose at least one fee to pay.")).toBeVisible();
  await form.getByRole("checkbox", { name: /September 2025/ }).check();
  await form.getByLabel("Amount for September 2025").fill("20");
  await expect(form.getByText(/Total: [A-Z]{3} 20\.00/)).toBeVisible();
  await form.getByLabel("Method").selectOption("mobile_money");
  await form.getByLabel("Reference").fill("EVC-E2E");
  await form.getByRole("button", { name: "Record payment" }).click();
  await expect(form.getByText(/Payment recorded: RCT-\d{6}/)).toBeVisible();

  // The receipt.
  await form.getByRole("link", { name: "Print receipt" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Payment receipt" })).toBeVisible();
  const receipt = page.getByRole("article");
  await expect(receipt).toContainText(name);
  await expect(receipt).toContainText("Mobile money");
  await expect(receipt).toContainText("EVC-E2E");
  await expect(receipt.getByRole("row", { name: /September 2025/ })).toContainText(/20\.00/);
  await expect(page.getByRole("button", { name: "Print receipt" })).toBeVisible();

  // The account: part paid, then reversed.
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const charge = page.getByRole("row", { name: /September 2025/ }).first();
  await expect(charge.getByText("Part paid")).toBeVisible();
  await page.getByRole("button", { name: "Reverse" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("Recorded for the wrong student");
  await dialog.getByRole("button", { name: "Reverse payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Reversed: Recorded for the wrong student")).toBeVisible();
  await expect(charge.getByText("Unpaid")).toBeVisible();

  // Waive the fee: nothing is owed.
  await charge.getByRole("button", { name: "Waive" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("Charged by mistake");
  await dialog.getByRole("button", { name: "Waive fee" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(charge.getByText("Waived", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Fee summary")).toContainText(/Balance[A-Z]{3} 0\.00/);

  // The payment stays listed as reversed.
  await page.goto(`/fees/payments?search=${encodeURIComponent(name)}`);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("Reversed");
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("cannot open Student Fees", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/fees");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});
