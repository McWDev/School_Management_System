import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Salaries journey as the demo School Admin: pay a month with a bonus and a
 * deduction in two parts, print the payslip, and reverse a payment. The test
 * adds its own staff member (the school's own staff are untouched) and
 * removes everything afterwards, resetting the payslip counter.
 */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const name = `E2E ${run} Teacher`;
const DEMO = "(select id from tenants where school_code = 'DEMO-HODAN')";

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
  await withClient((client) =>
    client.query(
      `insert into staff (tenant_id, full_name, work_type_id, gender, date_of_birth, phone, location, hire_date, salary)
       select ${DEMO}, $1, w.id, 'female', '1990-01-01', '+252 61 000 0000', 'E2E', '2020-01-01', 300
       from work_types w where w.tenant_id = ${DEMO} and lower(w.name) = 'teacher'`,
      [name],
    ),
  );
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    const member = `(select id from staff where tenant_id = ${DEMO} and full_name = $1)`;
    await client.query(
      `delete from salary_payments where entry_id in (select id from payroll_entries where staff_id = ${member})`,
      [name],
    );
    await client.query(`delete from payroll_entries where staff_id = ${member}`, [name]);
    await client.query(`delete from staff where tenant_id = ${DEMO} and full_name = $1`, [name]);
    // Continue numbering after the school's own last payslip.
    await client.query(
      `update payslip_counters set last_number = coalesce(
         (select max(substring(payslip_number from 5)::int) from salary_payments where tenant_id = ${DEMO}), 0)
       where tenant_id = ${DEMO}`,
    );
  });
});

test("pay a salary with a bonus and deduction, print the payslip and reverse", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  await page.goto("/staff");
  await page.getByRole("link", { name: "Salaries" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Salaries" })).toBeVisible();
  const row = page
    .getByRole("table", { name: /^Payroll for / })
    .getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText(/[A-Z]{3} 300\.00/);
  await expect(row.getByText("Unpaid")).toBeVisible();

  // First part: bonus 50, deduction 20 → net 330; pay 200.
  await row.getByRole("button", { name: `Pay ${name}` }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Bonus/).fill("50");
  await dialog.getByLabel(/^Deduction/).fill("20");
  await dialog.getByLabel("Note").fill("Extra classes; advance");
  await expect(dialog.getByText(/Net pay[A-Z]{3} 330\.00/)).toBeVisible();
  await dialog.getByLabel(/^Amount paid now/).fill("400");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog.getByText(/Only 330\.00 is still to pay\./)).toBeVisible();
  await dialog.getByLabel(/^Amount paid now/).fill("200");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog.getByText(/Salary paid: payslip PAY-\d{6}\./)).toBeVisible();

  // The payslip.
  await dialog.getByRole("link", { name: "Print payslip" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Payslip" })).toBeVisible();
  const slip = page.getByRole("article");
  await expect(slip).toContainText(name);
  await expect(slip.getByRole("row", { name: /Net pay/ })).toContainText("330.00");
  await expect(slip.getByRole("row", { name: /Paid with this payslip/ })).toContainText("200.00");
  await expect(slip.getByRole("row", { name: /Still to pay/ })).toContainText("130.00");
  await expect(page.getByRole("button", { name: "Print payslip" })).toBeVisible();

  // Back on the payroll: part paid; reverse the payment.
  await page.getByRole("link", { name: /Salaries ·/ }).click();
  await expect(row.getByText("Part paid")).toBeVisible();
  const payment = page.getByRole("row", { name: new RegExp(`PAY-\\d{6}.*${name}`) });
  await payment.getByRole("button", { name: "Cancel payment" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("Recorded twice");
  await dialog.getByRole("button", { name: "Cancel payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Cancelled: Recorded twice")).toBeVisible();
  // Back to the original month: bonus and deduction cleared, the plain salary owed.
  await expect(row.getByText("Unpaid")).toBeVisible();
  await expect(row).not.toContainText("330.00");
  await expect(row).not.toContainText("Extra classes");

  // The All payments report, filtered to this staff member.
  await page.getByRole("link", { name: "All payments report" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "All salary payments" })).toBeVisible();
  await page.getByRole("combobox", { name: "Staff", exact: true }).selectOption({ label: name });
  await page.getByRole("button", { name: "Apply filters" }).click();
  const report = page.getByRole("article", { name: "Salary payments" });
  await expect(report.getByRole("row", { name: new RegExp(name) })).toHaveCount(1);
  await expect(report.getByRole("row", { name: new RegExp(name) })).toContainText("Cancelled");
  await expect(report).toContainText(/0 payments · Total paid: [A-Z]{3} 0\.00 · 1 cancelled/);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export to Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Salary-payments-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("cannot open Salaries", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/staff/salaries");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});
