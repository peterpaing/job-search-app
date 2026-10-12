import { sql } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../db/index.js";
import {
  classifyJobPage,
  type AvailabilityResult,
} from "./job-availability.logic.js";
import { readJobPage } from "./safe-job-page.service.js";

type Candidate = {
  id: string;
  url: string;
  title: string;
  company: string;
};

type RecordedResult = {
  result: string;
};

const BATCH_SIZE = 200;
const CONCURRENCY = 3;

export async function checkJobAvailability() {
  // Expire known deadlines even when the source API is down
  // or the job has disappeared from a limited feed.
  const expired = await db.execute<{ id: string }>(sql`
    UPDATE public.jobs AS j
    SET
      is_active = false,
      updated_at = now()
    FROM public.job_availability AS a
    WHERE
      a.job_id = j.id
      AND j.is_active = true
      AND a.expires_at IS NOT NULL
      AND a.expires_at <= now()
    RETURNING j.id
  `);

  // Includes retained inactive jobs so verified reopened listings
  // can become active again.
  const candidates = await db.execute<Candidate>(sql`
    SELECT
      j.id,
      j.url,
      j.title,
      j.company
    FROM public.jobs AS j
    LEFT JOIN public.job_availability AS a
      ON a.job_id = j.id
    WHERE
      a.last_checked_at IS NULL
      OR a.last_checked_at <= now() - interval '24 hours'
    ORDER BY
      a.last_checked_at ASC NULLS FIRST,
      j.id ASC
    LIMIT ${BATCH_SIZE}
  `);

  const summary = {
    expired: expired.rows.length,
    checked: 0,
    active: 0,
    closed: 0,
    unknown: 0,
    skipped: 0,
  };

  let nextIndex = 0;

  async function worker() {
    while (nextIndex < candidates.rows.length) {
      const index = nextIndex;
      nextIndex += 1;

      const job = candidates.rows[index]!;

      const checkedAt = new Date().toISOString();
      let outcome: AvailabilityResult;

      try {
        const page = await readJobPage(job.url);

        outcome = classifyJobPage(job, page);
      } catch {
        outcome = {
          result: "unknown",
          reason: "page_check_failed",
          httpStatus: null,
          expiresAt: null,
        };
      }

      // Database failures must fail the task, not masquerade
      // as an unavailable website.
      const recorded = await db.execute<RecordedResult>(sql`
        SELECT public.record_job_availability(
          ${job.id}::text,
          ${job.url}::text,
          ${outcome.result}::text,
          ${outcome.reason}::text,
          ${outcome.httpStatus}::integer,
          ${checkedAt}::timestamptz,
          ${outcome.expiresAt}::timestamptz
        ) AS result
      `);

      const result = recorded.rows[0]?.result;

      summary.checked += 1;

      if (result === "active") {
        summary.active += 1;
      } else if (result === "closed") {
        summary.closed += 1;
      } else if (result === "skipped") {
        summary.skipped += 1;
      } else {
        summary.unknown += 1;
      }

      await delay(250);
    }
  }

  // Wait for every worker to finish before reporting failure.
  const workers = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );

  const failure = workers.find((result) => result.status === "rejected");

  if (failure?.status === "rejected") {
    throw failure.reason;
  }

  return summary;
}
