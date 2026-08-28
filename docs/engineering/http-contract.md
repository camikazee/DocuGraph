# HTTP Contract

## General format

The API prefix is `/api/v1`. Browser requests use Bearer JWT; automation may use
`dg_live_` keys on combined-auth endpoints. JSON uses UTF-8 and timestamps use
ISO 8601 UTC.

Errors retain `statusCode`, `message`, `error`, `path`, `timestamp`, and
`requestId` when available. Clients accept a string or validation-message array
and present one safe message.

## Response types

- JSON endpoints return JSON and may return `204` with no body.
- Upload endpoints preserve browser-generated multipart boundaries.
- Export endpoints return blobs with meaningful content type and filename.
- Public token endpoints never expose workspace, user, or Mongo internal IDs.

## Cancellation and idempotency

Reads may be cancelled with `AbortSignal`; cancellation is not an application
error. Retryable background work carries an idempotency key.

## Diagnostics

Liveness reports the process; readiness verifies data services. Consistency
diagnostics are authenticated, tenant-scoped, read-only, and never repair data
implicitly.

## Document templates

`GET /workspaces/:id/document-templates` returns stable objects with `id`,
`name`, `description`, `suggestedPath`, `contentRaw`, and `builtIn`. Built-in ids
start with `builtin:` and are immutable. Custom templates are scoped to one
workspace; Owner and Editor may create, update, and delete them, while every
workspace member may list them. Template responses never expose MongoDB ids.
