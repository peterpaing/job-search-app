import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is missing");
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error("The test database must be separate from the main database");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: testUrl,
  },
});
