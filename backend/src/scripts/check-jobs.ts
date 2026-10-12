import "dotenv/config";
import { checkJobAvailability } from "../services/job-availability.service.js";

async function main() {
  try {
    const result = await checkJobAvailability();

    console.log("Job availability check complete:", result);
  } catch (error) {
    console.error("Job availability check failed:", error);
    process.exitCode = 1;
  }
}

void main();
