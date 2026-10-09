import { cleanupJobs } from "../services/cleanup-jobs.service.js";

async function main() {
  try {
    const result = await cleanupJobs();

    console.log(
      `Deleted ${result.deleted} jobs stored before ${result.cutoff}.`,
    );
  } catch (error) {
    console.error("Failed to clean up old jobs:", error);
    process.exitCode = 1;
  }
}

void main();
