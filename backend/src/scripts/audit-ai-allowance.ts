import "dotenv/config";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getOwnerClerkUserId } from "../services/smart-match.owner.js";

const counter = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const auditRowSchema = z.object({
  period: z.string(),

  requests: counter,
  committed_tokens: counter,
  measured_micro: counter,
  committed_micro: counter,
  unresolved_requests: counter,

  known_requests: counter,
  known_measured_micro: counter,

  active_requests: counter,
  active_micro: counter,

  unknown_requests: counter,
  unknown_micro: counter,

  stalled_requests: counter,
  stalled_micro: counter,

  legacy_micro: counter,
  oldest_unconfirmed_at: z.string().nullable(),
});

function usd(micro: number) {
  return micro / 1_000_000;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 1) {
    console.error(
      "Usage: npx tsx src/scripts/audit-ai-allowance.ts [Clerk user ID]",
    );
    process.exitCode = 1;
    return;
  }

  const clerkUserId = args[0]?.trim() || getOwnerClerkUserId();

  if (!clerkUserId || !/^user_[a-zA-Z0-9]+$/.test(clerkUserId)) {
    console.error(
      "Provide a valid Clerk user ID or configure SMARTMATCH_OWNER_CLERK_USER_ID.",
    );
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is missing.");
    process.exitCode = 1;
    return;
  }

  const { db } = await import("../db/index.js");

  // One SELECT statement. No reservation, settlement, update,
  // delete, or AI-provider request is performed.
  const result = await db.execute(sql`
    WITH period AS (
      SELECT date_trunc(
        'month',
        now() AT TIME ZONE 'UTC'
      )::date AS month
    ),

    target AS (
      SELECT id
      FROM users
      WHERE clerk_user_id = ${clerkUserId}
    ),

    classified AS (
      SELECT
        r.reserved_micro,
        r.cost_micro,
        r.created_at,

        CASE
          WHEN r.status = 'known'
          THEN 'known'

          WHEN r.status = 'unknown'
          THEN 'unknown'

          WHEN r.status = 'reserved'
            AND EXISTS (
              SELECT 1
              FROM smart_match_locks l
              WHERE l.user_id = t.id
                AND l.lease_id = r.lease_id
                AND l.expires_at > now()
            )
          THEN 'active'

          ELSE 'stalled'
        END AS category

      FROM smart_match_cost_requests r
      JOIN target t
        ON r.user_scope = 'user:' || t.id::text
      CROSS JOIN period p

      WHERE r.month = p.month
    ),

    request_totals AS (
      SELECT
        COUNT(*) FILTER (
          WHERE category = 'known'
        ) AS known_requests,

        COALESCE(
          SUM(cost_micro) FILTER (
            WHERE category = 'known'
          ),
          0
        ) AS known_measured_micro,

        COUNT(*) FILTER (
          WHERE category = 'active'
        ) AS active_requests,

        COALESCE(
          SUM(reserved_micro) FILTER (
            WHERE category = 'active'
          ),
          0
        ) AS active_micro,

        COUNT(*) FILTER (
          WHERE category = 'unknown'
        ) AS unknown_requests,

        COALESCE(
          SUM(reserved_micro) FILTER (
            WHERE category = 'unknown'
          ),
          0
        ) AS unknown_micro,

        COUNT(*) FILTER (
          WHERE category = 'stalled'
        ) AS stalled_requests,

        COALESCE(
          SUM(reserved_micro) FILTER (
            WHERE category = 'stalled'
          ),
          0
        ) AS stalled_micro,

        (
          MIN(created_at) FILTER (
            WHERE category IN ('unknown', 'stalled')
          )
        )::text AS oldest_unconfirmed_at

      FROM classified
    ),

    legacy AS (
      SELECT
        COALESCE(
          SUM(old.reserved_cents::bigint * 10000),
          0
        ) AS legacy_micro

      FROM smart_match_usage old
      JOIN target t
        ON old.scope = 'user:' || t.id::text
      CROSS JOIN period p

      WHERE old.day >= p.month
        AND old.day < (p.month + interval '1 month')::date
    )

    SELECT
      p.month::text AS period,

      COALESCE(u.requests, 0) AS requests,
      COALESCE(u.committed_tokens, 0) AS committed_tokens,
      COALESCE(u.measured_micro, 0) AS measured_micro,
      COALESCE(u.committed_micro, 0) AS committed_micro,
      COALESCE(u.unresolved_requests, 0) AS unresolved_requests,

      r.known_requests,
      r.known_measured_micro,
      r.active_requests,
      r.active_micro,
      r.unknown_requests,
      r.unknown_micro,
      r.stalled_requests,
      r.stalled_micro,
      r.oldest_unconfirmed_at,

      legacy.legacy_micro

    FROM target t
    CROSS JOIN period p
    CROSS JOIN request_totals r
    CROSS JOIN legacy

    LEFT JOIN smart_match_cost_usage u
      ON u.scope = 'user:' || t.id::text
      AND u.period_kind = 'month'
      AND u.period_start = p.month
  `);

  const rows = z.array(auditRowSchema).parse(result.rows);
  const row = rows[0];

  if (!row) {
    console.error("No database account matches that Clerk user ID.");
    process.exitCode = 1;
    return;
  }

  const reservedMicro = Math.max(0, row.committed_micro - row.measured_micro);

  const detailedReservedMicro =
    row.active_micro + row.unknown_micro + row.stalled_micro;

  const detailedUnresolved =
    row.active_requests + row.unknown_requests + row.stalled_requests;

  const unmatchedMicro = Math.max(0, reservedMicro - detailedReservedMicro);

  const unmatchedRequests = Math.max(
    0,
    row.unresolved_requests - detailedUnresolved,
  );

  const report = {
    periodUtc: row.period,
    readOnly: true,

    recordedTotals: {
      requests: row.requests,
      tokensAccountedFor: row.committed_tokens,
      measuredUsd: usd(row.measured_micro),
      committedUsd: usd(row.committed_micro),
      reservedUsd: usd(reservedMicro),
      unresolvedRequests: row.unresolved_requests,
    },

    reservationBreakdown: {
      active: {
        requests: row.active_requests,
        reservedUsd: usd(row.active_micro),
      },

      unknownProviderUsage: {
        requests: row.unknown_requests,
        reservedUsd: usd(row.unknown_micro),
      },

      reservedWithoutActiveLease: {
        requests: row.stalled_requests,
        reservedUsd: usd(row.stalled_micro),
      },

      historicalOrUnmatched: {
        requests: unmatchedRequests,
        reservedUsd: usd(unmatchedMicro),
      },
    },

    historicalEvidence: {
      legacyTableReservedUsd: usd(row.legacy_micro),

      positiveUnmatchedAmountEqualsLegacy:
        unmatchedMicro > 0 && unmatchedMicro === row.legacy_micro,
    },

    checks: {
      measuredMatchesKnownRequestRecords:
        row.measured_micro === row.known_measured_micro,

      committedNotBelowMeasured: row.committed_micro >= row.measured_micro,

      detailedReservationsFitRecordedBalance:
        detailedReservedMicro <= reservedMicro,

      detailedUnresolvedFitRecordedCount:
        detailedUnresolved <= row.unresolved_requests,
    },

    oldestUnconfirmedRequestAt: row.oldest_unconfirmed_at,

    notes: [
      "Reserved amounts are not confirmed provider charges.",
      "Historical or unmatched amounts require review.",
      "An expired lease does not prove a request was free.",
      "This report does not release or reset any allowance.",
    ],
  };

  // Aggregate values only: no keys, prompts, emails, or account IDs.
  console.log(JSON.stringify(report, null, 2));
}

main().catch(() => {
  // Avoid printing connection strings or raw database errors.
  console.error(
    "Audit failed. Check database connectivity, applied migrations, and the script with npm run typecheck. Do not share credentials.",
  );

  process.exitCode = 1;
});
