import { expect, test } from "@playwright/test";

test("health endpoint reports the database as reachable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok", checks: { database: "ok" } });
  expect(JSON.stringify(body)).not.toMatch(/postgres|neon\.tech|password/i);
});
