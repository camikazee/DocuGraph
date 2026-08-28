# DocuGraph Architecture

## Product boundary

DocuGraph is a self-hosted documentation application for Markdown authoring,
reading, graph/health analysis, review, media, publishing, and team access. The
default installation remains a single `docker compose up` experience.

## Topology

- `frontend/`: Next.js browser application and public token-share reader.
- `backend/`: NestJS REST API and scheduled/background work.
- MongoDB: users, workspaces, access, metadata, indexes, revisions, events,
  notifications, audit logs, and durable background-job state.
- Workspace volume: Markdown source files and local media.

Frontend and backend are separate production images. MongoDB is included in
easy-install Compose but may be external in production. Redis, a queue broker,
object storage, and a Git provider remain optional.

## Persistence ownership

Markdown on disk is the recoverable content source. MongoDB is its queryable
mirror plus the source of application state. File writes are atomic where the
host supports atomic rename. Cross-store operations cannot be one transaction,
so failures are observable through diagnostics and recoverable by reindexing.

## Module boundaries

NestJS feature modules remain the primary organization. Controllers handle
transport concerns; focused services implement use cases and infrastructure
adapters implement filesystem, Git, mail, or storage operations. This does not
introduce another framework or a mandatory domain-layer hierarchy.

React pages compose feature components and hooks. Server communication belongs
to typed adapters. Shared UI primitives own accessibility behavior.

## Scaling assumptions

The default deployment is one backend instance. Work that must survive restart
uses MongoDB-backed state. Process-local cache is an optimization only. Before
horizontal scaling, schedulers and filesystem mutations require leases/locks.
