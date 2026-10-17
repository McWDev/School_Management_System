import { defineConfig } from "@neon/config/v1";

/** Long-lived branches that must never auto-expire. */
const PERSISTENT_BRANCHES = new Set(["production", "development"]);

export default defineConfig({
  // Authentication is custom-built in the app (07-Authentication-Roles-Security.md);
  // Neon Auth is intentionally disabled.
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault || PERSISTENT_BRANCHES.has(branch.name)) {
      // production (default) and the shared development branch: no expiry.
      return {};
    }
    if (!branch.exists) {
      // Other new branches (feature/test/preview) auto-expire.
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
