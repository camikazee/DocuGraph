# Testing Rules

## Test levels

- Unit: parsers, access policies, use cases, UI helpers, failure paths.
- Integration: Mongoose repositories, filesystem, job claims, consistency.
- E2E: auth, tenant isolation, roles/ACL, public contracts, Git and imports.
- Smoke: deployed frontend, health, readiness, optional docs health using GET.

## Required mutation cases

A changed mutation tests success, validation/rejection, authorization where
relevant, and partial failure. Assert durable state and side effects, not only
HTTP status. Retryable effects test idempotency and retry exhaustion.

## Isolation

Tests never purge a developer or production database. E2E uses isolated
`mongodb-memory-server` or explicit `MONGO_URI_TEST`. Filesystem tests use
unique temporary directories.

## Quality gates

Backend runs lint, unit, relevant E2E, and build. Frontend runs lint, typecheck,
unit, and build. Documentation validation is repository-wide. A sandbox port
restriction is reported, never converted into a passing E2E result.
