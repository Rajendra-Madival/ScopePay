# ScopePay

ScopePay helps freelancers manage client projects, scope changes, milestones, and PayPal payments.

## Run locally

1. Start PostgreSQL and create the database named by `DATABASE_URL`.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. Set the PayPal Sandbox credentials if checkout is needed.
3. Apply the additive Prisma migrations and generate the client:

   ```powershell
   cd backend
   npm install
   npm run prisma:deploy
   npm run prisma:generate
   npm run dev
   ```

4. In a second terminal:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

The frontend defaults to `http://localhost:5173` and the API to `http://localhost:3000`.

## Authentication configuration

Registration and login use server-side bcrypt password hashes and persistent database sessions. The browser receives a `Secure`/`HttpOnly` session cookie in production; development uses an HTTP cookie for localhost. Mutating requests use a same-site CSRF cookie/header pair and are restricted to `FRONTEND_ORIGIN`.

For local Postman testing, `FRONTEND_ORIGIN` defaults to `http://localhost:5173`. In non-production environments, requests without an `Origin` header are accepted; if you send an `Origin`, it must match the configured frontend origin. Production continues to require the exact allowed origin and HTTPS. Authenticated mutations still require the session cookies and CSRF header.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` together to enable password reset emails. Without all five settings, password recovery returns an explicit `503`; no reset token is exposed by the API. Password reset links expire after 30 minutes and can be used once.

For production, set `NODE_ENV=production`, use an HTTPS `FRONTEND_ORIGIN`, and terminate TLS at the server or its trusted reverse proxy. The API rejects non-HTTPS production requests and marks both cookies Secure. The configured proxy hop count in `backend/src/app.ts` must match the deployment topology.

## AI scope analysis and PayPal Sandbox

Scope-change analysis uses the OpenAI Responses API. Set `OPENAI_API_KEY` in `backend/.env`; `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The API key remains on the backend. Only the original and updated requirement text is sent to OpenAI, with response storage disabled. Analysis is qualitative guidance, not a price, schedule, or approval.
The authenticated, owner-checked analysis endpoint is `POST /api/projects/:projectId/scope-changes/analyze`.

Project planning uses the official Google GenAI SDK. Set `GEMINI_API_KEY` in `backend/.env`; `GEMINI_MODEL` defaults to `gemini-3.6-flash`. Keep this key on the server and never add it to the frontend. The authenticated endpoint `POST /api/ai/analyze-project` requires only a project description; it extracts stated details and suggests a budget when one is absent. Client contact details remain blank unless present in the brief, and are optional. Review all inferred details and milestone suggestions before approval; generated plans are not stored until approved. Milestones must total the approved project budget and are saved with the project in one database transaction. A transient Gemini 503 is retried once; persistent provider outages still require Gemini to recover.

PayPal checkout is configured for Sandbox by default. To enable it locally:

1. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `backend/.env`.
2. Keep `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com` and `PAYPAL_CURRENCY=USD`.
3. Set the same Sandbox app client ID as `VITE_PAYPAL_CLIENT_ID` in `frontend/.env` (copy `frontend/.env.example` first).
4. Restart both development servers and use a PayPal Sandbox buyer account to test checkout.

Do not use live PayPal credentials with the Sandbox URL. Keep all secrets in local environment files and never commit them.

Authentication endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `PATCH /api/auth/profile`
- `PATCH /api/auth/change-password`

## Project ownership and the legacy-data migration

The ownership migration adds a nullable `Project.ownerId`, a foreign key to `User`, and tables for sessions and password-reset tokens. It does not delete or rewrite existing projects, milestones, payments, or scope changes. The nullable owner is deliberate: existing projects have no reliable owner identity, so the migration never assigns them to the first user or any other account.

New projects are created with the authenticated user's ID. Every project, milestone, scope-change, payment, and PayPal operation is filtered by that owner. Ownerless legacy records remain in PostgreSQL but are not returned or mutable through the API until their owner is verified.

Before backfilling, back up the database and identify the correct account for each legacy project with the data owner. Then update only the confirmed project IDs in a transaction, using the corresponding verified user IDs:

```sql
BEGIN;
UPDATE "Project"
SET "ownerId" = '<verified-user-id>'
WHERE "id" = '<verified-project-id>' AND "ownerId" IS NULL;
-- Confirm exactly one row changed for each verified project.
COMMIT;
```

Do not run a broad update or assign projects based on account creation order. After every legacy project has a verified owner, a later migration can make `ownerId` non-null.

## Verification

Run backend tests and builds with:

```powershell
cd backend
npm test
npm run build
```

Run the frontend build and lint with:

```powershell
cd frontend
npm run build
npm run lint
```
