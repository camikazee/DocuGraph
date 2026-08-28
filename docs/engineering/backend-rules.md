# Backend Rules

## HTTP and use cases

Controllers map HTTP input, apply guards, call focused use cases, and map output.
Workflows involving repositories, Git, mail, audit, or multiple models belong
in injectable services.

DTO validation rejects unknown fields. Tenant membership, workspace roles, and
per-resource access remain server-side decisions; UI visibility is not auth.

## Persistence and side effects

Filesystem paths pass the workspace traversal guard. Markdown writes use a
sibling temporary file followed by atomic rename. Filesystem/Mongo mismatches
must be diagnosable and repair remains an explicit operator action.

Mail, automatic Git publication, and retryable external effects must not turn a
persisted user mutation into an ambiguous error. Use MongoDB-backed jobs with
idempotency keys, leases, bounded retries, and sanitized failures. Do not
require a queue broker for installation.

## Contracts and security

Return stable DTOs rather than accidental Mongoose documents. Public IDs are
UUIDs or paths. Hash password-equivalent tokens and encrypt reversible secrets.
Public errors do not expose stacks, secrets, internal IDs, or tenant existence.

## Observability

Requests retain `x-request-id`. Jobs and consistency checks expose enough
sanitized state for diagnosis without private document contents or credentials.
