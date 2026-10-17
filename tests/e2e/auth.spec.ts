import { expect, test } from "@playwright/test";
import { DEMO, expectOnDashboard, signIn } from "./helpers";

// These journeys start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("authentication", () => {
  test("protected pages redirect to login and return after sign-in", async ({ page }) => {
    await page.goto("/students");
    await expect(page).toHaveURL(/\/login\?next=%2Fstudents$/);

    await page.getByLabel("Email").fill(DEMO.schoolAdmin.email);
    await page.getByLabel("Password").fill(process.env.SEED_USER_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Students");
  });

  test("shows a generic error for wrong credentials", async ({ page }) => {
    await signIn(page, `nobody.${Date.now()}@example.com`, "definitely wrong pw");
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    // The email is kept so the user can correct the password.
    await expect(page.getByLabel("Email")).not.toHaveValue("");
  });

  test("explains why a pending school cannot sign in", async ({ page }) => {
    await signIn(page, DEMO.pendingSchoolAdmin.email);
    await expect(page.getByText(/awaiting approval/)).toBeVisible();
  });

  test("signs in, shows the account, sets a secure cookie and signs out", async ({
    page,
    context,
  }) => {
    await signIn(page, DEMO.schoolAdmin.email);
    await expectOnDashboard(page);

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name.endsWith("sms_session"));
    expect(session).toBeDefined();
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    // `next start` runs in production mode, so the cookie is Secure with a __Host- prefix.
    expect(session).toMatchObject({ name: "__Host-sms_session", secure: true });

    await page.getByRole("button", { name: `Account menu for ${DEMO.schoolAdmin.name}` }).click();
    await expect(page.getByText(DEMO.schoolAdmin.email)).toBeVisible();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The old session no longer works, even if the cookie were replayed.
    await context.addCookies([session!]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a signed-in user visiting /login goes to the dashboard", async ({ page }) => {
    await signIn(page, DEMO.schoolAdmin.email);
    await expectOnDashboard(page);
    await page.goto("/login");
    await expectOnDashboard(page);
  });

  test("forgot password explains that email reset is not available yet", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByText("Password reset by email is not available yet.")).toBeVisible();
  });

  test("reset page rejects an invalid link", async ({ page }) => {
    await page.goto("/reset-password?token=not-a-real-token");
    await page.getByLabel("New password", { exact: true }).fill("a fresh password 1");
    await page.getByLabel("Confirm new password").fill("a fresh password 1");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();
  });
});
