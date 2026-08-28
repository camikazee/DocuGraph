# DocuGraph Project Contract

## Mission

DocuGraph is an open-source, self-hosted documentation system. It should be
easy to install for a first-time contributor while remaining useful for teams
with large documentation sets and advanced workflows.

## Architecture

Keep the established topology: Next.js frontend, NestJS REST API, MongoDB
index/application data, and workspace Markdown on the filesystem. Frontend and
backend remain separately deployable images. Do not add a mandatory service to
the default installation without an accepted ADR.

## Required workflow

1. Read `docs/engineering/architecture.md` and the rules for the area changed.
2. Inspect local patterns and tests before editing.
3. Make the smallest coherent change; keep controllers and React pages thin.
4. Test success, rejection, and partial failure for changed mutations or
   external side effects.
5. Run lint, typecheck, tests, and build for every affected application.
6. Update `docs/engineering/change-log.md` after a substantial completed block.
7. Add an ADR before changing topology, persistence ownership, authentication,
   or required infrastructure.

## Non-negotiable rules

- Product/UI language is English.
- Components do not construct API URLs or authorization headers; use typed
  adapters under `frontend/lib`.
- Backend controllers map HTTP input/output and delegate orchestration.
- Markdown files remain recoverable source data; MongoDB remains the query
  index and application-state store.
- Public responses use UUIDs or file paths, never MongoDB `_id` values.
- Do not commit secrets, private credentials, production passwords, or personal
  filesystem paths.
- Do not add dead controls, fabricated statistics, or silent partial success.

## Definition of Done

A change is complete when affected gates pass, installation remains simple,
public contracts match implementation, and operational consequences are
recorded.
