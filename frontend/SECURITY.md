# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email the
repository maintainer privately with details and reproduction steps. We will
acknowledge promptly and coordinate a fix and disclosure.

## Notes for this package

This is the DocuGraph web client. It holds **no server secrets**: the only
build-time variable is `NEXT_PUBLIC_API_URL` (the public backend URL). The JWT
is stored client-side and sent as a `Bearer` token to the API.

The backend enforces authentication, authorization, multi-tenant isolation,
input validation and rate limiting — see the backend repository's `SECURITY.md`
for the full security review.
