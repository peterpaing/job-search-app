import "dotenv/config";
import { defineConfig } from "vitest/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is missing");
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error("The test database must be separate from the main database");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.integration.ts"],
    env: {
      DATABASE_URL: testUrl,
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
