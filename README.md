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

## ML service boundaries and feature map

The Python service defines all 13 task endpoints in `ml-services/app/main.py`; protected requests require a server-to-server bearer token. The Next.js gateway is `POST /api/ml/inference` and maps the `task` field to those routes after session and role checks. The student-facing recommendation API is a separate TypeScript rules baseline. Never treat rules-based output as trained-model output.

| Task | Current UI | App endpoint → ML endpoint | Verified implementation status |
| --- | --- | --- | --- |
| Resume parsing | Resume Library: Analyze saved PDF | `POST /api/ml/resume/parse` → `/v1/resume/parse-file` | Heuristic text extraction; not trained. Extraction stays on-screen for review and is not persisted. |
| Internship recommendations | Student overview and opportunities | `GET /api/ml/recommendations` (TypeScript; does not call ML service) | Explainable skills/interests rules; eligibility and prior applications filtered. |
| Candidate matching | No recruiter UI yet | `/api/ml/inference` → `/v1/match` | Rules-based skill comparison; API-only. |
| Placement prediction | No prediction UI; admin sees capability status | `/api/ml/inference` → `/v1/placement/predict` | Unavailable; no approved outcome data or model artifact. |
| Eligibility | Student opportunity cards | Client `checkEligibility`; service alternative `/api/ml/inference` → `/v1/eligibility` | Deterministic criteria checks; service endpoint is not currently called by the UI. |
| Resume ranking | No recruiter ranking UI yet | `/api/ml/inference` → `/v1/rank` | Rules-based ranking; API-only and requires human review. |
| Salary prediction | No estimate UI; admin sees capability status | `/api/ml/inference` → `/v1/salary/predict` | Unavailable; no approved compensation data or evaluated artifact. |
| Skill-gap analysis | Student Career tools | Client `explainSkillFit`; service alternative `/api/ml/inference` → `/v1/skill-gap` | Exact skill overlap; the existing UI does not call the Python endpoint. |
| Interview practice | Student Career tools | Prompts generated in the client; service alternative `/api/ml/inference` → `/v1/interview` | Practice prompts and rubric; no automated score or model claim. |
| Knowledge retrieval | No student-facing assistant yet | `/api/ml/inference` → `/v1/knowledge/retrieve` | Extractive snippets only; API-only, and callers must permission-filter source documents. |
| Resume classification | No classification UI; admin sees capability status | `/api/ml/inference` → `/v1/resume/classify` | Unavailable; no approved labeled dataset or artifact. |
| Duplicate/anomaly review | No review UI yet | `/api/ml/inference` → `/v1/fraud/check` | Exact/near-duplicate review flags; API-only and not evidence of misconduct. |
| Fairness audits | Admin sees capability status, not audit results | `/api/ml/inference` → `/v1/fairness/audit` | Unavailable; requires authorized outcome labels and an audit protocol. No sensitive traits are inferred. |

`GET /api/ml` returns the authenticated capability catalog. `POST /api/ml/contracts/validate` is administrator-only and checks training documentation; completeness is not model approval or deployment authorization. The generic JSON gateway caps requests at 64 KiB; resume parsing uses its dedicated multipart gateway so the service token stays server-side and PDF uploads retain the existing 4 MB limit.

## ML service development and deployment

For local development, run the Next.js app with `pnpm dev` and the service separately from `ml-services/` using the Python dependencies in `requirements.txt` and `uvicorn app.main:app --host 0.0.0.0 --port 8000`. The app server needs `ML_SERVICE_URL` and `ML_SERVICE_TOKEN`; the Python container needs the same `ML_SERVICE_TOKEN` (at least 32 characters). Use a different secret per environment and keep both values server-side. `GET /healthz` is the unauthenticated liveness check; inference and model capabilities remain authenticated.

For deployment, deploy Next.js to Vercel and build the independent service with `docker build -t pathway-ml ./ml-services`. Run the container on a container-capable platform, set its `ML_SERVICE_TOKEN`, then configure `ML_SERVICE_URL` (HTTPS) and the matching `ML_SERVICE_TOKEN` in the Vercel project for each environment. The current health check confirms process liveness only; it does not expose credentials or assert that a model is trained.

No approved training datasets, generated model artifacts, reproducible training/evaluation commands, background training worker, or model promotion workflow are present in the repository. Do not report the service's rules baselines as trained models. The Drizzle schema includes a model registry table, but this audit found no checked-in migrations or administrator actions to train, approve, deploy, or roll back models. Database migration history and actual connected-database state need separate verification before schema changes.

The app sets baseline response security headers in `next.config.mjs`; HSTS is limited to production HTTPS. Private routes enforce server-side sessions and role checks, and state-changing endpoints validate request origin. Keep the Neon and Blob integrations configured for every deployment environment that needs them. `.env.example` contains placeholders only; replace them in local/project environment settings and never commit credentials.
