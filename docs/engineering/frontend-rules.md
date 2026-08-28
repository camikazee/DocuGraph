# Frontend Rules

## API access

Views and components call typed adapters under `frontend/lib`; they do not
construct API URLs, Bearer headers, or response parsing locally. The client
supports JSON, multipart forms, blobs, empty responses, errors, and aborting.

Loads triggered by changing search, selection, workspace, or pagination prevent
stale responses from replacing current state. Abort is normal control flow and
does not produce an error toast.

## Components and state

Pages compose feature components and hooks. Extract behavior when a page owns
multiple independent workflows or becomes difficult to test. Every data surface
defines loading, error, and empty states. Do not show demo data behind loaders
or leave controls wired to no action.

## Accessibility

Controls have accessible names, visible focus, and native keyboard behavior.
Dialogs set and contain focus, close on Escape/backdrop when safe, lock scroll,
and restore focus. Status and errors use appropriate live regions. Motion
respects `prefers-reduced-motion`.

## Crawler policy

The authenticated application and token shares are not search-index targets.
Share responses avoid leaking tokens through referrers and request `noindex`,
`nofollow`, and `noarchive`.
