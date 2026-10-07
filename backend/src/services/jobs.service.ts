import { getRemoteOkJobs } from "./remote-ok.service.js";
import { getHimalayasJobs } from "./himalayas.service.js";

export async function getJobs() {
  const results = await Promise.allSettled([
    getRemoteOkJobs(),
    getHimalayasJobs(),
  ]);

  const jobs: Awaited<ReturnType<typeof getRemoteOkJobs>> = [];
  let successfulSources = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      successfulSources += 1;
      jobs.push(...result.value);
    } else {
      console.error("Job source failed:", result.reason);
    }
  }

  if (successfulSources === 0) {
    throw new Error("All job sources failed");
  }

  return jobs;
}
