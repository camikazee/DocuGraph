# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email the
repository maintainer privately with details and reproduction steps. We will
acknowledge promptly and coordinate a fix and disclosure.

## Notes for this package

This is the DocuGraph web client. It holds **no server secrets**. In container
deployments the browser calls same-origin `/api/v1`, and the Next.js server
forwards requests to the fixed, runtime-only `DOCUGRAPH_API_UPSTREAM`. The
gateway accepts no user-controlled upstream, forwards only bounded HTTP
headers (including Bearer authorization), and never forwards browser cookies.
`NEXT_PUBLIC_API_URL` remains an optional native-development override. The JWT
is stored client-side and sent as a `Bearer` token to the API.

The backend enforces authentication, authorization, multi-tenant isolation,
input validation and rate limiting — see the backend repository's `SECURITY.md`
for the full security review.
