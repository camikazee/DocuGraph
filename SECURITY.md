# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, email the
repository maintainer privately with details and steps to reproduce. We aim to
acknowledge reports promptly and will coordinate a fix and disclosure timeline
with you.

## Scope & hardening

The backend ships a detailed security review (auth model, multi-tenant
isolation, adversarial e2e tests, and pre-production hardening recommendations):
see [`backend/SECURITY.md`](./backend/SECURITY.md).

## Before deploying publicly

- Set strong, unique secrets via your environment / secrets manager —
  **never** commit them. At minimum: `JWT_SECRET` and `MEDIA_SECRET`
  (used to encrypt stored volume credentials and Git push remotes).
  The `docker-compose.yml` secret is a **local-demo placeholder only**.
- Set `CORS_ORIGINS` to your actual frontend origin (not `*`).
- Configure SMTP (`SMTP_*`) for real password-reset email delivery.
- Consider tighter rate limits on `/auth/*` and protecting `/api/docs`.

Stored secrets (passwords, invite/CI tokens) are kept only as hashes; volume
credentials and push remotes are encrypted at rest (AES-256-GCM).
