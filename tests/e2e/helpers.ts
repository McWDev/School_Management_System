import { expect, type Page } from "@playwright/test";

/** Synthetic demo accounts created by `npm run db:seed`. */
export const DEMO = {
  schoolAdmin: { email: "admin@demo-hodan.example", name: "Hodan School Admin (Demo)" },
  pendingSchoolAdmin: { email: "admin@demo-warta.example" },
};

export function demoPassword(): string {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) throw new Error("SEED_USER_PASSWORD is not set; run npm run db:seed first.");
  return password;
}

export async function signIn(page: Page, email: string, password = demoPassword()) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function expectOnDashboard(page: Page) {
  await expect(page).toHaveURL(/\/dashboard$/);
  // The dashboard greets the user ("Good morning, …").
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), /,
  );
}

/** Sign in and wait until the app has landed on the dashboard. */
export async function signInAs(page: Page, email: string) {
  await signIn(page, email);
  await expectOnDashboard(page);
}
