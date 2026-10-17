import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });
// Edits the shared demo school's profile, so run these steps in order, once.
test.describe.configure({ mode: "serial" });

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
  const preview = page.locator("header").filter({ hasText: "Hodan Demo School" });
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
