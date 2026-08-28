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

## Content analytics

`GET /workspaces/:id/documents/content-analytics?days=30` returns actionable
content insights for the current workspace. Owner and Editor may read this
endpoint; Viewer receives `403`. The optional `days` query parameter defaults
to `30` and accepts exactly `7`, `30`, or `90`; other values receive `400`.

The response has this shape:

```json
{
  "periodDays": 30,
  "reads": 8,
  "uniqueReaders": 2,
  "deadPageCount": 1,
  "zeroResultSearches": 3,
  "mostRead": [
    {
      "filePath": "guides/api.md",
      "title": "API guide",
      "reads": 8,
      "uniqueReaders": 2
    }
  ],
  "deadPages": [
    {
      "filePath": "guides/old.md",
      "title": "Old guide",
      "lastReadAt": null,
      "updatedAt": "2026-07-01T12:00:00.000Z",
      "inactiveDays": 58
    }
  ],
  "searchesWithoutResults": [
    {
      "query": "missing api",
      "count": 3,
      "lastSearchedAt": "2026-08-28T12:00:00.000Z"
    }
  ]
}
```

Document rows and read totals include only current documents visible through
the requesting member's resource-access rules. Deleted documents and data from
other workspaces are excluded. A dead page is a visible current document that
is at least seven days old and has zero reads in the selected period. Ranked
lists contain at most ten rows. Responses expose paths, titles, counts, and ISO
timestamps, never MongoDB ids or user ids.

`GET /workspaces/:id/documents/search?q=...` retains its existing array
response. Only a completed search with zero access-filtered results records an
analytics event. Recorded terms are trimmed, lowercased, have internal
whitespace collapsed, and are truncated to 160 characters; normalized terms
shorter than two characters are ignored. Search telemetry contains no user id,
file path, IP address, user-agent string, raw URL, or result content.

## Document templates

`GET /workspaces/:id/document-templates` returns stable objects with `id`,
`name`, `description`, `suggestedPath`, `contentRaw`, and `builtIn`. Built-in ids
start with `builtin:` and are immutable. Custom templates are scoped to one
workspace; Owner and Editor may create, update, and delete them, while every
workspace member may list them. Template responses never expose MongoDB ids.

## Document snippets

`GET /workspaces/:id/document-snippets` returns stable objects with `id`,
`name`, `description`, `contentRaw`, and `builtIn`. Built-in ids start with
`builtin:` and are immutable. Custom snippets are tenant-scoped; Owner and
Editor may create, update, and delete them, while every workspace member may
list them. Snippet responses never expose MongoDB ids.

## Frontmatter schemas

`GET /workspaces/:id/frontmatter-schemas` returns schemas scoped to the current
workspace. Every workspace member may list them. Owner and Editor may use
`POST /workspaces/:id/frontmatter-schemas`,
`PATCH /workspaces/:id/frontmatter-schemas/:schemaId`, and
`DELETE /workspaces/:id/frontmatter-schemas/:schemaId` to manage custom
schemas. Built-in ids start with `builtin:` and are immutable.

A public schema has this exact shape:

```json
{
  "id": "schema UUID or builtin:basic",
  "name": "Release metadata",
  "description": "Fields used by release notes.",
  "fields": [],
  "builtIn": false
}
```

Each ordered field in `fields` has this exact shape:

```json
{
  "key": "stage",
  "label": "Stage",
  "type": "select",
  "required": true,
  "options": ["draft", "published"],
  "defaultValue": "draft"
}
```

Supported field types are exactly `text`, `number`, `boolean`, `date`,
`select`, and `list`. Responses expose stable string ids and never MongoDB
internal ids. This API stores editor schema definitions only; it does not
intercept, validate, or otherwise change document-write requests.
