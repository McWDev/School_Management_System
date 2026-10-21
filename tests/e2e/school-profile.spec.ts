import { expect, test } from "@playwright/test";
import pg from "pg";
import { signInAs } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });
// Edits the shared demo school's profile, so run these steps in order, once.
test.describe.configure({ mode: "serial" });

/*
 * The school's own letterhead details and logo are saved before these tests
 * and put back afterwards, so running the tests never changes them.
 */
const DEMO = "(select id from tenants where school_code = 'DEMO-HODAN')";
const PROFILE_COLUMNS = [
  "legal_name",
  "manager_name",
  "contact_email",
  "phone",
  "website",
  "address",
  "motto",
];
let savedProfile: Record<string, unknown> | null = null;
let savedLogo: Record<string, unknown> | null = null;

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
  // Only the desktop run edits the profile.
  if (!process.env.DATABASE_URL || testInfo.project.name !== "chromium") return;
  await withClient(async (client) => {
    savedProfile = (
      await client.query(`select ${PROFILE_COLUMNS.join(", ")} from tenants where id = ${DEMO}`)
    ).rows[0];
    savedLogo =
      (
        await client.query(
          `select content_type, byte_size, data, updated_at from school_logos where tenant_id = ${DEMO}`,
        )
      ).rows[0] ?? null;
  });
});

test.afterAll(async ({}, testInfo) => {
  if (!process.env.DATABASE_URL || testInfo.project.name !== "chromium" || !savedProfile) return;
  await withClient(async (client) => {
    await client.query(
      `update tenants set ${PROFILE_COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(", ")} where id = ${DEMO}`,
      PROFILE_COLUMNS.map((c) => savedProfile![c]),
    );
    await client.query(`delete from school_logos where tenant_id = ${DEMO}`);
    if (savedLogo) {
      await client.query(
        `insert into school_logos (tenant_id, content_type, byte_size, data, updated_at)
         values (${DEMO}, $1, $2, $3, $4)`,
        [savedLogo.content_type, savedLogo.byte_size, savedLogo.data, savedLogo.updated_at],
      );
    }
  });
});

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("school admin fills the letterhead and uploads a logo", async ({ page, isMobile }) => {
  test.skip(isMobile, "Profile editing is covered on desktop; layout on mobile by other tests.");
  await signInAs(page, "admin@demo-hodan.example");
  await page.goto("/settings/school-profile");
  await expect(page.getByRole("heading", { level: 1, name: "School Profile" })).toBeVisible();

  const motto = `Learning for life ${Date.now().toString(36)}`;
  await page.getByLabel("Manager name").fill("Amina Hassan (Demo)");
  await page.getByLabel("Official email").fill("office@demo-hodan.example");
  await page.getByLabel("Phone").fill("+252 61 000 0000");
  await page.getByLabel("Website").fill("demo-hodan.example");
  await page.getByLabel("School motto").fill(motto);
  await page.getByLabel("Address").fill("Main Road, Mogadishu");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("School profile saved.")).toBeVisible();

  // The letterhead preview uses the saved details.
  // The letterhead preview (found by its motto, whatever the school is called).
  const preview = page.locator("header").filter({ hasText: motto });
  await expect(preview.getByText(`“${motto}”`)).toBeVisible();
  await expect(preview.getByText("Manager: Amina Hassan (Demo)")).toBeVisible();
  await expect(preview.getByText("demo-hodan.example").first()).toBeVisible();

  // Upload a logo; the private route serves it to this signed-in admin.
  await page.getByLabel("School logo").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByText("Logo updated.")).toBeVisible();
  const logo = await page.request.get("/api/school-logo");
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toBe("image/png");
  // The letterhead (used on every report, receipt and payslip) now shows the logo.
  await page.reload();
  await expect(preview.getByRole("img", { name: / logo$/ })).toBeVisible();

  // A file pretending to be an image is rejected by its content.
  await page.getByLabel("School logo").setInputFiles({
    name: "evil.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg onload=alert(1)></svg>"),
  });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByText("Use a PNG, JPEG or WebP image.").first()).toBeVisible();
});

test("the logo is private to the school's signed-in users", async ({ request }) => {
  const anonymous = await request.get("/api/school-logo");
  expect(anonymous.status()).toBe(404);
});

test("school admin can remove the logo", async ({ page, isMobile }) => {
  test.skip(isMobile, "Covered on desktop.");
  await signInAs(page, "admin@demo-hodan.example");
  await page.goto("/settings/school-profile");
  await page.getByRole("button", { name: "Remove logo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove logo" }).click();
  // The dialog closes only after the server confirmed the removal.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove logo" })).toHaveCount(0);
  expect((await page.request.get("/api/school-logo")).status()).toBe(404);
});
