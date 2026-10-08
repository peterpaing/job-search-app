import "dotenv/config";
import { importJobs } from "../services/import-jobs.service.js";

async function main() {
  try {
    const result = await importJobs();

    console.log(
      `Import complete: fetched ${result.fetched} jobs, inserted or updated ${result.processed} unique jobs.`,
    );
  } catch (error) {
    console.error("Job import failed:", error);
    process.exitCode = 1;
  }
}

void main();
