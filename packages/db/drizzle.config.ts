import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  schemaFilter: ["public"],
  tablesFilter: ["!$supabase_*"],
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
