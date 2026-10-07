import { getWeWorkRemotelyJobs } from "./we-work-remotely.service.js";
import { getRemoteOkJobs } from "./remote-ok.service.js";
import { getHimalayasJobs } from "./himalayas.service.js";
import { getDevGlobalJobs } from "./dev-global-jobs.service.js";

type Job =
  | Awaited<ReturnType<typeof getWeWorkRemotelyJobs>>[number]
  | Awaited<ReturnType<typeof getRemoteOkJobs>>[number]
  | Awaited<ReturnType<typeof getHimalayasJobs>>[number]
  | Awaited<ReturnType<typeof getDevGlobalJobs>>[number];

export async function getJobs(): Promise<Job[]> {
  const results = await Promise.allSettled([
    getHimalayasJobs(),
    getDevGlobalJobs(),
    getWeWorkRemotelyJobs(),
    getRemoteOkJobs(),
  ]);

  const jobs: Job[] = [];
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
