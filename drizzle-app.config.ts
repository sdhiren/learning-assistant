import { defineConfig } from "drizzle-kit";

/** The profile registry. Profile learning databases use drizzle.config.ts. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/app-schema.ts",
  out: "./drizzle-app",
  dbCredentials: {
    url: process.env.REGISTRY_PATH ?? "./data/app.db",
  },
  strict: true,
  verbose: true,
});
