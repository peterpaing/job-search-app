# StackWing Operations

## Safety rules

- Never commit credentials, deploy hooks, authentication state, or real environment files.
- Never run integration tests against production.
- Verify the database destination before migrations, imports, cleanup, or recovery.
- Keep production, development, and CI credentials separate.
- Do not change Stripe live-payment flags merely to resolve CI failures.
- Recovery actions involving production data require an explicit operator decision.

## Environment separation

### Local development

Use development Clerk credentials, a development Neon database, and Stripe test mode.

Copy the committed environment examples only when creating a new private configuration. Do not overwrite working configuration.

### CI

Browser tests use Clerk development credentials and a dedicated test user.

Integration tests use an isolated database. The workflow checks its hostname and database name against approved variables, but those checks do not independently prove that the operator selected a safe database.

### Production

Use the production database and the intended production Clerk instance.

The frontend's browser-facing Clerk key and API origin must match the deployment. Keep secret keys server-side.

## GitHub Actions configuration

Configure settings under repository Settings → Secrets and variables → Actions.

### CI secrets

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk development publishable key for tests.
- `CLERK_SECRET_KEY`: matching Clerk development secret key.
- `E2E_CLERK_USER_EMAIL`: dedicated development test user's email.
- `CI_TEST_DATABASE_URL`: isolated integration-test connection URL.

Although publishable keys are public, the current CI workflow reads its test publishable key from Secrets.

### CI variables

- `CI_TEST_DATABASE_HOST`: exact hostname from the test URL, including `-pooler` when present.
- `CI_TEST_DATABASE_NAME`: database name without the leading slash or query parameters.

Secret values must contain only the connection URL, not a shell command, assignment, or surrounding quotes.

### Image-publishing variables

- `PUBLISH_DOCKER_IMAGES=true`: enables image publishing after successful checks.
- `PUBLISH_FRONTEND_IMAGE=true`: also publishes the frontend image.
- `PROD_CLERK_PUBLISHABLE_KEY`: intended deployed frontend publishable key.
- `PROD_API_BASE_URL`: backend HTTPS origin, without an API path.
- `PROD_SUPPORT_EMAIL`: public support address.
- `PROD_ACCOUNT_DELETION_ENABLED`: explicitly `true` or `false`.

Test Clerk keys and production build keys are separate settings.

### Optional deployment automation

- Variable `RENDER_CD_ENABLED=true` enables deployment requests when both images were published successfully.
- Secrets `RENDER_BACKEND_DEPLOY_HOOK` and `RENDER_FRONTEND_DEPLOY_HOOK` hold private deploy hooks.

Leave deployment automation disabled unless intentionally configured.

The deployment job requests images by digest and checks that the commit is still current on `main`. It does not wait for Render health verification. A successful deployment-request step is not proof of a healthy deployment.

### Scheduled jobs

The job-refresh workflow uses the `DATABASE_URL` secret.

The billing-sync workflow additionally uses:

Secrets:

- `STRIPE_SECRET_KEY`

Variables:

- `STRIPE_PRO_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`
- `FRONTEND_ORIGIN`
- `BILLING_MODE`
- `BILLING_LIVE_ENABLED`

Scheduled workflows do not inherit Render environment settings. Keep their intended destinations and modes coordinated explicitly.

## Database migrations

Migrations are committed under `backend/drizzle`.

### Development

After verifying the development `DATABASE_URL`, run from `backend`:

```powershell
npm run db:migrate
```

### Isolated test database

After verifying `TEST_DATABASE_URL`, run:

```powershell
npm run db:migrate:test
npm run test:integration
```

Do not run local tests concurrently with CI against the same database.

### Production

1. Review the migration SQL and its data-loss implications.
2. Confirm the production destination privately.
3. Confirm an available recovery point or backup and understand its limitations.
4. Test the migration against a separate representative environment.
5. Plan compatibility between old and new application versions.
6. Apply the committed migrations from a trusted source checkout with the intended environment.
7. Deploy compatible application images.
8. Verify readiness and affected features.

Do not run `db:generate` or `drizzle-kit push` as a production recovery shortcut.

The current CI workflow migrates the test database, not production. The backend runtime image does not include a complete migration toolchain; it is not the place to assume `npm run db:migrate` will work.

## Docker and Render deployment

The project contains separate frontend and backend Dockerfiles using Node.js 24.

Published image names follow:

```text
ghcr.io/peterpaing/job-search-app/backend:sha-COMMIT_SHA
ghcr.io/peterpaing/job-search-app/frontend:sha-COMMIT_SHA
```

A moving `main` tag is also published. Prefer recording exact image digests or commit tags for release tracking and recovery.

### Backend runtime configuration

Configure the intended values privately in Render:

- `DATABASE_URL`
- Clerk publishable and secret keys.
- `FRONTEND_ORIGIN`, matching the canonical frontend origin.
- Applicable billing, AI, and account-deletion settings.
- `TRUSTED_PROXY_CIDRS` only after verifying the actual trusted proxy configuration.

Do not set proxy trust broadly just to silence a warning.

The Dockerfile defaults to port `10000`. Render and the application's effective port must agree.

### Frontend configuration

Browser-facing `NEXT_PUBLIC_*` values are compiled into the frontend image.

Changing these values requires rebuilding the image:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SUPPORT_EMAIL`
- `NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED`

For CI-built images, configure their corresponding `PROD_*` GitHub variables before building.

Frontend runtime settings include:

- `CLERK_SECRET_KEY`, matching the deployed public key's Clerk instance.
- `JOBS_API_URL`, pointing to the backend's `/api/jobs` endpoint.

`JOBS_API_URL` serves server-rendered job searches. The public API base URL is used by browser requests. Verify both.

Never pass secret keys as public build arguments.

### Deployment checklist

1. Wait for frontend, backend, and database-integration checks to pass.
2. Confirm that image publishing succeeded for the intended commit.
3. Apply any required production migrations through the reviewed migration process.
4. Verify the intended Render environment configuration.
5. Deploy the intended image versions.
6. Wait for Render to report a successful deployment.
7. Verify application health and the affected features.

Configure the backend Render health-check path as `/health/ready`.

Check both backend endpoints:

```text
GET /health/live
GET /health/ready
```

Expected successful responses:

```json
{ "status": "alive" }
```

```json
{ "status": "ready" }
```

The frontend does not currently have a dedicated readiness endpoint. Check the homepage, successful job loading, authentication, and the feature affected by the release. A homepage response alone does not prove backend connectivity.

Reference:

- [Render image deployment](https://render.com/docs/deploying-an-image)
- [Render health checks](https://render.com/docs/health-checks)

## Job refresh operations

### Schedule

- Daily import and cleanup: `00:17 UTC`, or `06:47 Myanmar time`.
- Availability checks: hourly at minute `17`.
- Manual `Refresh jobs` runs include import, checks, and cleanup.

GitHub may delay scheduled runs.

### Availability

Each run selects up to:

- 200 active jobs due for a check after 24 hours.
- 20 inactive jobs due for a check after seven days.

The queues have independent allowances. Never-checked jobs come first, followed by the oldest check.

Checks retain existing closure-confirmation safeguards. Unknown page results are not proof that a job is closed.

Cleanup deletes only inactive jobs closed for more than 30 days that are neither saved nor tracked. Availability tombstones can remain after job deletion.

### Imports

- Himalayas: cursor pagination, at most 20 pages of up to 20 listings.
- Dev Global Jobs: offset pagination, at most 10 pages of up to 100 listings.
- Remote OK: API feed.
- We Work Remotely: programming-jobs RSS feed.

Developer-role filtering happens before storage. Page caps do not mean every source listing is imported.

Pagination warnings indicate bounded coverage. A failed source can be omitted while other sources still import successfully. Review source warnings and errors, not only the final workflow status.

Confirm current attribution and commercial-use permissions before expanding production imports.

### Recovery after an import failure

1. Open the failed workflow and identify the failing step or source.
2. Distinguish import failures from database, availability-check, and cleanup failures.
3. Correct credentials, configuration, or source compatibility as appropriate.
4. Respect provider rate limits; do not repeatedly rerun a rate-limited source.
5. Rerun the workflow when safe.
6. Review the import output and availability summary.

A manual rerun modifies the configured database and also runs availability checks and cleanup. Do not treat it as a read-only diagnostic.

Do not mass-delete listings or clear closure evidence to make a workflow green.

## Billing configuration and recovery

Use one consistent Stripe mode for each configured operation:

- `BILLING_MODE`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`
- `STRIPE_WEBHOOK_SECRET`

Price IDs, portal configurations, and webhook signing secrets must belong to the intended environment and account.

Keep live payments disabled until account requirements, verification, and the release checklist are satisfied. Do not switch live billing on as part of routine documentation setup.

The webhook endpoint is:

```text
POST /api/billing/webhook
```

Keep its raw-body middleware ahead of JSON parsing. Do not change webhook signatures, idempotency, or retry behavior during an unrelated logging change.

The current local Stripe-listener script expects:

```text
C:\tools\stripe\stripe.exe
```

It also requires an `sk_test_` key. Adapt that local tooling deliberately if the executable is installed elsewhere; never use a live key for the local listener.

### Failed billing synchronization

1. Inspect the `Sync Premium subscriptions` workflow output.
2. Check that its GitHub secrets and variables exist.
3. Confirm the database, Stripe account, and mode match the intended environment.
4. Correct configuration without enabling live billing unnecessarily.
5. Rerun synchronization when the destination is confirmed.
6. Review the checked and failed counts and verify affected billing status.

Reconciliation reads Stripe state and updates local billing records. It is not a substitute for manually reviewing payment disputes, refunds, or account-verification issues.

Do not manually grant paid access or edit payment history merely to bypass a synchronization failure.

## Account-deletion operations

Backend deletion requires coordinated settings:

- `ACCOUNT_DELETION_ENABLED`
- `ACCOUNT_DELETION_WORKER_ENABLED`

The frontend control uses the build-time setting:

- `NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED`

When enabled, the worker periodically retries pending deletion work. An accepted request is not necessarily a completed deletion.

Keep required Clerk and billing credentials available for pending work. If records exist in both Stripe modes, the deletion service may also require the corresponding private `STRIPE_TEST_SECRET_KEY` or `STRIPE_LIVE_SECRET_KEY`.

Do not clear deletion markers or recreate deleted identities as a recovery shortcut. Inspect pending work and restore the required dependencies instead.

## HTTP logs and request IDs

Backend responses include `X-Request-ID`.

To investigate a failure:

1. Capture the request ID from the browser's Network response headers.
2. Search backend logs for the same ID.
3. Inspect the `http_request` completion record.
4. Inspect any associated `http_error` record.

Completion records include status, duration, and whether the response completed or was aborted.

Error records contain an operation, approved error category/code, and fingerprint. Raw exception messages, request bodies, tokens, and query values are intentionally omitted by this logger.

A fingerprint groups identical captured error details; it is not a readable stack trace or a guaranteed stable identifier across releases.

Do not ask users to share authentication headers, cookies, or complete private request payloads.

Scheduled scripts and background workers still have separate logging behavior. The HTTP logger does not automatically sanitize or correlate their existing logs.

## Deployment recovery

1. Identify the affected release and preserve relevant request IDs and deployment logs.
2. Pause automated deployment requests if necessary.
3. Select the last known-good image versions or digests.
4. Check whether those versions remain compatible with the current database schema.
5. Redeploy only after confirming compatibility.
6. Verify backend readiness, frontend job loading, authentication, and affected features.

Rolling back an image does not roll back database migrations, environment changes, or external provider state.

Do not reset the database to recover an application-only deployment failure.

## Database recovery

For suspected data loss or corruption:

1. Stop or isolate affected writers, workers, and scheduled jobs as appropriate.
2. Preserve the current state before attempting recovery.
3. Identify the affected time range and recovery objective.
4. Confirm the recovery options available for the Neon project and plan.
5. Prefer validating a recovery on a separate branch before changing production.
6. Review effects on user records, deletion markers, billing state, and newer writes.
7. Obtain operator approval before switching production to recovered data.
8. Reconcile external Clerk and Stripe state deliberately.

A restore can lose newer writes or resurrect records that were intentionally deleted. Database recovery does not rewind external services.

A branch copied from production is not automatically a safe test dataset. Use empty or appropriately sanitized test data.

Reference:

- [Neon branching](https://neon.com/docs/introduction/branching)
- [Neon restore](https://neon.com/docs/postgres/backup-restore/branch-restore)

## Known follow-up work

- Automated health verification after deployment requests.
- Consistent structured logging for scheduled scripts and workers.
- Distributed abuse protection where process-local limits are insufficient.
- Monitoring import caps and availability backlog as listing volume grows.
- Continued search and SmartMatch scalability improvements.
