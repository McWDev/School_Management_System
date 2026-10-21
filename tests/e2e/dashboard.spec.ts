import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

/*
 * Dashboard: greeting, real staff figures that match the School Staff list,
 * charts with table views, and the simpler views for other users.
 */

/** Count staff in the demo school straight from the database. */
async function demoStaffCounts() {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select s.status, count(*)::int as n from staff s
       join tenants t on t.id = s.tenant_id where t.school_code = 'DEMO-HODAN'
       group by s.status`,
    );
    const by = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
    // The school can rename itself, so read its current name.
    const {
      rows: [school],
    } = await client.query("select name from tenants where school_code = 'DEMO-HODAN'");
    return {
      active: by("active"),
      inactive: by("inactive"),
      left: by("left"),
      name: school.name as string,
    };
  } finally {
    await client.end();
  }
}

test("school admin sees a greeting and real staff figures", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Hodan$/,
  );
  await expect(page.getByRole("region", { name: "Welcome" })).toContainText(
    (await demoStaffCounts()).name,
  );

  const tile = (label: string) => page.getByRole("link", { name: new RegExp(`^${label}`) });
  const figure = async (label: string) =>
    Number((await tile(label).locator(".text-2xl").textContent())?.replace(/\D/g, ""));
  // Other tests add staff in parallel: retry until the page and the database agree.
  await expect(async () => {
    await page.reload();
    const counts = await demoStaffCounts();
    expect(await figure("Active staff")).toBe(counts.active);
    expect(await figure("Inactive staff")).toBe(counts.inactive);
    expect(await figure("Staff who left")).toBe(counts.left);
  }).toPass({ timeout: 60_000 });

  // Tiles open the matching filtered staff list.
  await tile("Inactive staff").click();
  await expect(page).toHaveURL(/\/staff\?status=inactive$/);
});

test("charts carry a table view for screen readers", async ({ page }) => {
  await page.goto("/dashboard");
  const counts = await demoStaffCounts();
  test.skip(counts.active + counts.inactive === 0, "No current staff in the demo school.");
  await expect(page.getByRole("table", { name: "Current staff by work type" })).toBeAttached();
  await expect(page.getByRole("list", { name: "Gender of current staff" })).toBeVisible();
});

test.describe("other users", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a teacher gets a welcome without staff figures", async ({ page }) => {
    await signInAs(page, "teacher@demo-hodan.example");
    await expect(page.getByRole("region", { name: "Welcome" })).toBeVisible();
    await expect(page.getByText("Active staff")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  });

  test("the platform admin sees school counts", async ({ page }) => {
    await signInAs(page, "platform.admin@sms.example");
    const welcome = page.getByRole("region", { name: "Welcome" });
    await expect(welcome.getByText("Platform administration")).toBeVisible();
    await expect(page.getByText("Awaiting approval")).toBeVisible();
  });
});
