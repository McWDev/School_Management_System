import { test as setup } from "@playwright/test";
import { ADMIN_STATE } from "../../playwright.config";
import { DEMO, expectOnDashboard, signIn } from "./helpers";

setup("sign in as the demo school admin", async ({ page }) => {
  await signIn(page, DEMO.schoolAdmin.email);
  await expectOnDashboard(page);
  await page.context().storageState({ path: ADMIN_STATE });
});
