# Pathway

Pathway is a role-aware internship and placement workspace built with Next.js 16, Better Auth, Drizzle, and Neon Postgres. Students manage profiles and private resumes, recruiters submit listings and review their own applicants, placement officers review listings, and administrators manage roles and inspect model/service status.

## Local development

The Vercel project supplies `DATABASE_URL` through the Neon integration and `BLOB_READ_WRITE_TOKEN` through Blob. Better Auth also requires `BETTER_AUTH_SECRET` (at least 32 characters). Keep credentials in the Vercel project environment or an ignored local environment file; never commit them.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Use `pnpm typecheck` for a strict TypeScript check and `pnpm build` for the production build.

## Data and access boundaries

- Better Auth manages email/password accounts and sessions. The Drizzle client and Better Auth share the same `pg` pool.
- App queries that contain user data scope records to the authenticated user or to resources owned by that user. Neon does not provide row-level security for these tables.
- Resume files are stored privately; database metadata and all download/delete operations are scoped to the owning account.
- Elevated portal roles are assigned by an administrator. Signup creates a student profile; it does not grant recruiter or administrator access.
- Schema changes for this connected Neon project are applied through the Neon integration, then reflected in `lib/db/schema.ts`. This repository currently has no checked-in migration runner or migration history.

## ML service boundaries

The service contracts live in `lib/ml-services/contracts.ts`.

- `GET /api/ml` returns the authenticated service capability catalog.
- `GET /api/ml/recommendations` returns user-scoped recommendations based on listed skills/interests and published listing criteria. The response explicitly identifies its deterministic rules method; it is not a trained model, hiring score, or employment decision.
- `POST /api/ml/contracts/validate` is administrator-only and checks the required training documentation. A complete contract is not model approval or deployment authorization.
- Resume parsing, salary prediction, and fairness auditing remain unavailable until their data provenance, privacy, evaluation, review, and artifact requirements are met. Fairness checks never infer protected attributes.

## Production notes

The app sets baseline response security headers in `next.config.mjs`; HSTS is limited to production HTTPS. Private routes enforce server-side sessions and role checks, and state-changing endpoints validate request origin. Keep the Neon and Blob integrations configured for every deployment environment that needs them, and verify that required environment variables are present before publishing.

No model artifacts or training datasets are bundled with the repository. Do not treat the demo ranking logic as a trained or validated model.
