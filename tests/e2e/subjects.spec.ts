import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/* Subjects journey as the demo School Admin; cleans up the subjects it creates. */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;

const teacher = `E2E ${run} Teacher`;
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

// A synthetic teacher to assign (the school's own staff are never changed).
test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient((client) =>
    client.query(
      `insert into staff (tenant_id, full_name, work_type_id, gender, date_of_birth, phone, location, hire_date)
       select ${DEMO}, $1, w.id, 'female', '1990-01-01', '+252 61 000 0000', 'E2E', '2020-01-01'
       from work_types w where w.tenant_id = ${DEMO} and lower(w.name) = 'teacher'`,
      [teacher],
    ),
  );
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await withClient(async (client) => {
    await client.query("delete from subjects where name like $1", [`E2E ${run}%`]);
    await client.query(`delete from staff where tenant_id = ${DEMO} and full_name = $1`, [teacher]);
    // Continue numbering after the school's own last subject code.
    await client.query(
      `update subject_number_counters c set last_number = coalesce(
         (select max(substring(code from 5)::int) from subjects s where s.tenant_id = c.tenant_id), 0)
       where tenant_id = ${DEMO}`,
    );
  });
});

test("add, edit, inactivate and delete a subject", async ({ page, isMobile }) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  const name = `E2E ${run} Biology`;

  await page.goto("/subjects");
  await expect(page.getByRole("heading", { level: 1, name: "Subjects" })).toBeVisible();

  await page.getByRole("button", { name: "Add subject" }).click();
  let form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Add subject" }).click();
  await expect(form.getByText("Enter the subject name.")).toBeVisible();
  // The code is given by the system, so there is nothing to type for it.
  await expect(form.getByLabel("Code")).toHaveCount(0);
  await form.getByLabel("Subject name").fill(name);
  await form.getByRole("button", { name: "Add subject" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search by name or code" }).fill(`E2E ${run}`);
  await page.getByRole("button", { name: "Apply" }).click();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText(/SUB-\d{3,}/);
  await expect(row.getByText("Active", { exact: true })).toBeVisible();

  // Assign the one teacher; only staff with the work type Teacher are listed.
  await expect(row.getByText("Not assigned")).toBeVisible();
  await row.getByRole("button", { name: "Assign teacher" }).click();
  form = page.getByRole("dialog");
  const choice = form.getByRole("combobox", { name: "Teacher" });
  await expect(choice.locator("option", { hasText: teacher })).toHaveCount(1);
  await choice.selectOption({ label: teacher.concat(" · +252 61 000 0000") });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText(teacher);

  await row.getByRole("button", { name: "Edit" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Status").selectOption("inactive");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByText("Inactive")).toBeVisible();

  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete subject" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toHaveCount(0);
});

test("the old Courses page opens Subjects", async ({ page }) => {
  await page.goto("/courses");
  await expect(page).toHaveURL(/\/subjects$/);
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("can view subjects but not change them", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/subjects");
    await expect(page.getByRole("heading", { level: 1, name: "Subjects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add subject" })).toHaveCount(0);
  });
});
