import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Examinations journey as the demo School Admin: choose the class, enter a
 * subject's Midterm, Activities and Final, then see total, average and
 * Pass/Fail. The test adds its own year, class, subject and students (the
 * school's own data is untouched) and removes them afterwards.
 */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const year = `E2E ${run} year`;
const className = `E2E ${run} class`;
const subject = `E2E ${run} Science`;
const pupils = [`E2E ${run} Amina`, `E2E ${run} Bashir`];
const DEMO = "(select id from tenants where school_code = 'DEMO-HODAN')";
/** Active subjects of the demo school (they all count in the average). */
let subjectCount = 1;

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
      rows: [y],
    } = await client.query(
      `insert into academic_years (tenant_id, name, status) values (${DEMO}, $1, 'upcoming') returning id`,
      [year],
    );
    const {
      rows: [c],
    } = await client.query(
      `insert into classes (tenant_id, name, seats) values (${DEMO}, $1, 5) returning id`,
      [className],
    );
    // A test code outside the school's SUB-001… numbering.
    await client.query(`insert into subjects (tenant_id, name, code) values (${DEMO}, $1, $2)`, [
      subject,
      `E2E-${run}`,
    ]);
    const {
      rows: [{ n }],
    } = await client.query(
      `select count(*)::int as n from subjects where tenant_id = ${DEMO} and status = 'active'`,
    );
    subjectCount = n;
    for (const [i, name] of pupils.entries()) {
      const {
        rows: [s],
      } = await client.query(
        `insert into students (tenant_id, student_number, full_name, gender, date_of_birth, admission_date,
           guardian_name, guardian_phone)
         values (${DEMO}, $1, $2, 'female', '2012-01-01', '2020-01-01', 'E2E', '+252 61 000 0000') returning id`,
        [`E2E-${run}-${i}`, name],
      );
      await client.query(
        `insert into student_enrollments (tenant_id, student_id, class_id, academic_year_id)
         values (${DEMO}, $1, $2, $3)`,
        [s.id, c.id, y.id],
      );
    }
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    await client.query(
      `delete from subject_marks where tenant_id = ${DEMO} and subject_id in
         (select id from subjects where tenant_id = ${DEMO} and name = $1)`,
      [subject],
    );
    await client.query(`delete from students where tenant_id = ${DEMO} and full_name = any($1)`, [
      pupils,
    ]);
    await client.query(`delete from subjects where tenant_id = ${DEMO} and name = $1`, [subject]);
    await client.query(`delete from classes where tenant_id = ${DEMO} and name = $1`, [className]);
    await client.query(`delete from academic_years where tenant_id = ${DEMO} and name = $1`, [
      year,
    ]);
  });
});

test("choose a class, enter Midterm, Activities and Final, and see Pass/Fail", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  await page.goto("/exams");
  await expect(page.getByRole("heading", { level: 1, name: "Examinations" })).toBeVisible();

  // First the class: then its students' subjects.
  await page
    .getByRole("combobox", { name: "Academic year", exact: true })
    .selectOption({ label: year });
  await page
    .getByRole("combobox", { name: "Class", exact: true })
    .selectOption({ label: className });
  await page.getByRole("button", { name: "Show students" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`${className} · ${year}`) }),
  ).toBeVisible();
  await page.getByRole("link", { name: `Enter marks for ${subject}` }).click();

  // Every student of the class, with Midterm /30, Activities /20 and Final /50.
  const [amina, bashir] = pupils;
  await expect(page.getByRole("row", { name: new RegExp(amina) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(bashir) })).toBeVisible();
  await page.getByLabel(`Midterm for ${amina}`).fill("31");
  await page.getByLabel(`Activities for ${amina}`).fill("18");
  await page.getByLabel(`Final for ${amina}`).fill("45");
  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByText("Use at most 30.")).toBeVisible();
  await page.getByLabel(`Midterm for ${amina}`).fill("25.5");
  // The total updates as marks are typed.
  await expect(page.getByRole("row", { name: new RegExp(amina) })).toContainText("88.5");
  await page.getByLabel(`Midterm for ${bashir}`).fill("10");
  await page.getByLabel(`Activities for ${bashir}`).fill("5");
  await page.getByLabel(`Final for ${bashir}`).fill("20");
  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByText("Marks saved for 2 students.")).toBeVisible();

  // Results: total, average and Pass/Fail.
  await page.getByRole("link", { name: "Class results" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Results · ${className}` }),
  ).toBeVisible();
  const results = page.getByRole("article");
  // Every Active subject of the school counts; ones without marks count as 0.
  const shown = (total: number) => (Math.floor((total * 10) / subjectCount) / 10).toFixed(1);
  const pass = (total: number) => total / subjectCount >= 50;
  await expect(results.getByRole("row", { name: new RegExp(amina) })).toContainText(
    new RegExp(`88\\.5.*${shown(88.5).replace(".", "\\.")}.*${pass(88.5) ? "Pass" : "Fail"}`),
  );
  await expect(results.getByRole("row", { name: new RegExp(bashir) })).toContainText(/35.*Fail/);
  await expect(results).toContainText(`${pass(88.5) ? 1 : 0} of 2 students passed.`);
  await expect(page.getByRole("button", { name: "Print results" })).toBeVisible();
  // Export to Excel downloads the class results as a workbook.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export to Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Results-E2E-.+\.xlsx$/);

  // One student's result: manage the marks, then the printable slip.
  await results.getByRole("link", { name: amina }).click();
  await expect(page.getByRole("heading", { level: 1, name: amina })).toBeVisible();
  await expect(page.getByLabel(`Midterm in ${subject}`)).toHaveValue("25.5");
  await page.getByLabel(`Final in ${subject}`).fill("50");
  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByText("Marks saved.")).toBeVisible();
  await expect(page.getByLabel("Result summary")).toContainText(/Total\s*93\.5/);
  await expect(page.getByRole("link", { name: /Next student/ })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const slip = page.getByRole("article");
  await expect(slip.getByRole("heading", { name: "Student result" })).toBeVisible();
  await expect(slip).toContainText(/Report date: \d{1,2} \w+ \d{4}/);
  await expect(slip.getByLabel("No photo")).toBeVisible();
  await expect(slip.getByRole("row", { name: new RegExp(subject) })).toContainText("93.5");
  await page.emulateMedia({ media: "screen" });
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("can open Examinations but only view subjects they do not teach", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/exams");
    await expect(page.getByRole("heading", { level: 1, name: "Examinations" })).toBeVisible();
    await page
      .getByRole("combobox", { name: "Academic year", exact: true })
      .selectOption({ label: year });
    await page
      .getByRole("combobox", { name: "Class", exact: true })
      .selectOption({ label: className });
    await page.getByRole("button", { name: "Show students" }).click();
    await expect(page.getByRole("link", { name: `View marks for ${subject}` })).toBeVisible();
  });
});
