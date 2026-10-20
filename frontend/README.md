# StackWing Frontend

The frontend uses Next.js and React.

See the root `README.md` for complete local setup, backend requirements, and testing instructions.

See `docs/OPERATIONS.md` in the project root for deployment and recovery.

## Local development

Use Node.js 24.

Create a private `.env` from `.env.example` only if you do not already have working configuration. Replace the placeholders with development values.

From this folder:

```powershell
npm ci
npm run dev
```

The default frontend address is `http://localhost:3000`.

Run the backend separately on port `5000`.

## Checks

```powershell
npm run format:check
npm run lint
npm run test:run
npm run build
```

## Browser tests

Browser tests require matching Clerk development keys and a dedicated `+clerk_test` user from that instance.

```powershell
npx playwright install chromium
npx playwright test --project=chromium
```

The tests start a mock API on port `5010` and a Next.js server on port `3100`. Clerk authentication still requires network access.

Do not commit Playwright reports, traces, authentication state, or real environment files.

## Deployment configuration

`NEXT_PUBLIC_*` settings are compiled into the frontend image and require a rebuild when changed.

`CLERK_SECRET_KEY` and `JOBS_API_URL` are server-side settings. Never expose secret values through a `NEXT_PUBLIC_*` name.

Local and CI Clerk development credentials must remain separate from production deployment credentials.
