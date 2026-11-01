import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here (Postgres is provisioned by default; Neon Auth intentionally disabled, app uses Better Auth)
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
