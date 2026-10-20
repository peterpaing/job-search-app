import { sql } from "drizzle-orm";

const ACTIVE_BATCH_SIZE = 200;
const INACTIVE_BATCH_SIZE = 20;

export const availabilityCandidatesQuery = sql`
  SELECT id, url, title, company
  FROM (
    (
      SELECT
        j.id,
        j.url,
        j.title,
        j.company,
        a.last_checked_at,
        0 AS queue_priority
      FROM public.jobs AS j
      LEFT JOIN public.job_availability AS a
        ON a.job_id = j.id
      WHERE
        j.is_active = true
        AND (
          a.last_checked_at IS NULL
          OR a.last_checked_at <= now() - interval '24 hours'
        )
      ORDER BY
        a.last_checked_at ASC NULLS FIRST,
        j.id ASC
      LIMIT ${ACTIVE_BATCH_SIZE}
    )

    UNION ALL

    (
      SELECT
        j.id,
        j.url,
        j.title,
        j.company,
        a.last_checked_at,
        1 AS queue_priority
      FROM public.jobs AS j
      LEFT JOIN public.job_availability AS a
        ON a.job_id = j.id
      WHERE
        j.is_active = false
        AND (
          a.last_checked_at IS NULL
          OR a.last_checked_at <= now() - interval '7 days'
        )
      ORDER BY
        a.last_checked_at ASC NULLS FIRST,
        j.id ASC
      LIMIT ${INACTIVE_BATCH_SIZE}
    )
  ) AS candidates
  ORDER BY
    queue_priority ASC,
    last_checked_at ASC NULLS FIRST,
    id ASC
`;
