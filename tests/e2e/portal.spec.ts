import { expect, test } from "@playwright/test";
import pg from "pg";

/*
 * Students Portal journey: the demo School Admin gives a (synthetic) student
 * a login, then the student signs in, sees their own profile, results and
 * fees, changes their password, and cannot open staff pages. Everything the
 * test adds is removed afterwards.
 */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const name = `E2E ${run} Portal`;
const year = `E2E ${run} year`;
const className = `E2E ${run} class`;
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

test.beforeAll(async ({}, testInfo) => {
  if (!process.env.DATABASE_URL || testInfo.project.name !== "chromium") return;
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
    const {
      rows: [s],
    } = await client.query(
      `insert into students (tenant_id, student_number, full_name, gender, date_of_birth, admission_date,
         guardian_name, guardian_phone, fee_type)
       values (${DEMO}, $1, $2, 'female', '2012-01-01', '2020-01-01', 'E2E Guardian', '+252 61 000 0000',
         'full_scholarship') returning id`,
      [`E2E-${run}`, name],
    );
    await client.query(
      `insert into student_enrollments (tenant_id, student_id, class_id, academic_year_id)
       values (${DEMO}, $1, $2, $3)`,
      [s.id, c.id, y.id],
    );
  });
});

test.afterAll(async ({}, testInfo) => {
  if (!process.env.DATABASE_URL || testInfo.project.name !== "chromium") return;
  await withClient(async (client) => {
    const {
      rows: [s],
    } = await client.query(
      `select id, user_id from students where tenant_id = ${DEMO} and full_name = $1`,
      [name],
    );
    if (s) {
      await client.query("delete from students where id = $1", [s.id]);
      if (s.user_id) {
        await client.query("delete from audit_logs where actor_user_id = $1", [s.user_id]);
        await client.query("delete from users where id = $1", [s.user_id]);
      }
    }
    await client.query(`delete from classes where tenant_id = ${DEMO} and name = $1`, [className]);
    await client.query(`delete from academic_years where tenant_id = ${DEMO} and name = $1`, [
      year,
    ]);
  });
});

test("give a student a portal login, then the student signs in", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  test.setTimeout(180_000);

  // Opening the page gives the student a login with a generated password.
  await page.goto("/settings");
  await page.getByRole("link", { name: /^Students Portal/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Students Portal" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search by name or Student ID" }).fill(name);
  await page.getByRole("button", { name: "Apply" }).click();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Can sign in");

  // The school can see the password (hidden until Show is pressed).
  await expect(row).toContainText("••••••");
  await page.getByRole("button", { name: "Show" }).click();
  const shown = (await row.getByRole("cell").nth(2).innerText()).trim();
  expect(shown).toMatch(/^\d{6}$/);

  // Reset gives a new password on a printable slip.
  await page.getByRole("button", { name: `Reset password for ${name}` }).click();
  const slip = page.getByRole("list", { name: "New portal logins" }).getByRole("listitem");
  const values = slip.locator("dd.font-mono");
  await expect(values.nth(0)).toHaveText("DEMO-HODAN");
  await expect(values.nth(1)).toHaveText(`E2E-${run}`);
  const password = (await values.nth(2).innerText()).trim();
  expect(password).toMatch(/^\d{6}$/);
  await expect(slip).toContainText(`/student-login?school=DEMO-HODAN`);
  await expect(page.getByRole("button", { name: "Print logins" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // The student signs in with their Student ID (a fresh browser, not signed in).
  const studentContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const student = await studentContext.newPage();
  await student.goto("/student-login?school=DEMO-HODAN");
  await expect(student.getByLabel("School code")).toHaveValue("DEMO-HODAN");
  await student.getByLabel("Student ID").fill(`E2E-${run}`);
  await student.getByLabel("Password").fill(password);
  await student.getByRole("button", { name: "Sign in" }).click();
  await expect(student).toHaveURL(/\/portal$/);
  await expect(student.getByRole("heading", { level: 1, name: `Welcome, ${name}` })).toBeVisible();
  await expect(student.getByText(className)).toBeVisible();

  const nav = student.getByRole("navigation", { name: "Students Portal" });
  await nav.getByRole("link", { name: "My results" }).click();
  await expect(student.getByRole("heading", { level: 1, name: "My results" })).toBeVisible();
  await expect(student.getByRole("button", { name: "Print result" })).toBeVisible();
  await nav.getByRole("link", { name: "My fees" }).click();
  await expect(student.getByRole("heading", { level: 1, name: "My fees" })).toBeVisible();
  await expect(student.getByText("Nothing to pay")).toBeVisible();

  // Staff pages are not for students: they go back to the portal.
  await student.goto("/students");
  await expect(student).toHaveURL(/\/portal$/);

  // The student changes their own password.
  await nav.getByRole("link", { name: "Change password" }).click();
  await student.getByLabel("Current password").fill(password);
  const newPassword = password === "246810" ? "135790" : "246810";
  await student.locator("#new-password").fill(newPassword);
  await student.getByLabel("New password again").fill(newPassword);
  await student.getByRole("button", { name: "Change password" }).click();
  await expect(student.getByText("Your password is changed.")).toBeVisible();
  await studentContext.close();

  // The school sees the new password.
  await page.reload();
  await page.getByRole("searchbox", { name: "Search by name or Student ID" }).fill(name);
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText(newPassword);
});
