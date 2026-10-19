import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Academic Year journey as the demo School Admin. The demo school's own Current
 * year is restored afterwards and the years this test creates are removed.
 */
test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
const created: string[] = [];

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

let previousCurrent: string | null = null;

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  previousCurrent = await withClient(async (client) => {
    const { rows } = await client.query(
      `select y.id from academic_years y join tenants t on t.id = y.tenant_id
       where t.school_code = 'DEMO-HODAN' and y.status = 'current'`,
    );
    return rows[0]?.id ?? null;
  });
});

test.afterAll(async () => {
  // Only the run that changed years restores them (desktop and mobile run in parallel).
  if (!process.env.DATABASE_URL || !created.length) return;
  await withClient(async (client) => {
    if (created.length) {
      await client.query("delete from academic_years where name = any($1)", [created]);
    }
    if (previousCurrent) {
      await client.query("update academic_years set status = 'current' where id = $1", [
        previousCurrent,
      ]);
    }
  });
});

test("add, make current, edit and delete an academic year", async ({ page, isMobile }) => {
  test.skip(isMobile, "The full journey runs on desktop.");
  const first = `E2E ${run} 2026–2027`;
  const second = `E2E ${run} 2027–2028`;
  created.push(first, second, `${second} edited`);

  await page.goto("/academic-years");
  await expect(page.getByRole("heading", { level: 1, name: "Academic Year" })).toBeVisible();

  // The name is required and kept after an error.
  await page.getByRole("button", { name: "Add academic year" }).click();
  let form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Add academic year" }).click();
  await expect(form.getByText("Enter the academic year name.")).toBeVisible();
  await form.getByLabel("Academic year").fill(first);
  await form.getByLabel("Status").selectOption("current");
  await form.getByRole("button", { name: "Add academic year" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A second, Upcoming year.
  await page.getByRole("button", { name: "Add academic year" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Academic year").fill(second);
  await form.getByRole("button", { name: "Add academic year" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search by academic year" }).fill(`E2E ${run}`);
  await page.getByRole("button", { name: "Apply" }).click();
  const rowOf = (name: string) => page.getByRole("row", { name: new RegExp(`^${name}`) });
  await expect(rowOf(first).getByText("Current")).toBeVisible();
  await expect(rowOf(second).getByText("Upcoming")).toBeVisible();

  // Dashboard shows the Current year.
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: `Academic year ${first}` })).toBeVisible();
  await page.goto(`/academic-years?search=${encodeURIComponent(`E2E ${run}`)}`);

  // Making the second year Current closes the first.
  await rowOf(second).getByRole("button", { name: "Make current" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Make current" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowOf(second).getByText("Current")).toBeVisible();
  await expect(rowOf(first).getByText("Closed")).toBeVisible();

  // Edit the name.
  await rowOf(second).getByRole("button", { name: "Edit" }).click();
  form = page.getByRole("dialog");
  await form.getByLabel("Academic year").fill(`${second} edited`);
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowOf(`${second} edited`)).toBeVisible();

  // Delete after confirming.
  await rowOf(first).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete academic year" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowOf(first)).toHaveCount(0);
});

test.describe("teachers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("cannot open Academic Year", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await page.goto("/academic-years");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});
