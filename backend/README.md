# DocuGraph — Backend

Backend dla **DocuGraph** — platformy SaaS do dokumentacji deweloperskiej (Markdown jako kod, Git jako źródło prawdy, MongoDB jako szybki indeks).

## Funkcje

- **Auth & multi-tenancy** — rejestracja, login, GitHub/Slack OAuth, JWT, role
  Owner/Editor/Viewer, zaproszenia, tokeny CI/CD, izolacja tenantów, reset hasła.
- **Document pipeline** — dwufazowy zapis (plik `.md` na dysku + mirror w MongoDB),
  parser front matter/HTML/linków, rewizje i historia, komentarze, przenoszenie.
- **Graf i jakość** — graf linków, raport zepsutych linków + autofix, sieroty.
- **Wyszukiwanie** — pełnotekstowe (MongoDB `$text`).
- **Media** — pluggable wolumeny (Local / S3 / FTP/SFTP), upload, przenoszenie
  między wolumenami, publiczne URL-e capability, poświadczenia szyfrowane (AES-256-GCM).
- **Git source** — indeksowanie z GitHub, **podpisane webhooki** (HMAC) z reindeksem,
  **Publish to Git** (commit & push) z opcjonalnym auto-syncem edycji.
- **Telemetria** — odczyty, czas czytania, obserwowanie (watching).
- **E-mail** — reset hasła przez SMTP (nodemailer; w dev Mailpit).

Pełna lista endpointów: **Swagger** pod `/api/docs`.

## Stos technologiczny

- **NestJS 10** (TypeScript, `strict`)
- **MongoDB** + **Mongoose**
- **Passport** (JWT + GitHub OAuth) · **bcrypt**
- Walidacja env: **Joi** · Walidacja wejść: **class-validator**
- Bezpieczeństwo: **helmet**, **CORS**, **@nestjs/throttler** (rate limiting)
- Dokumentacja: **Swagger/OpenAPI** (`/api/docs`)
- Testy: **Jest** + **Supertest**

> **Node:** działa na Node 18+. Do produkcji zalecany **Node 20 LTS** (i wtedy NestJS 11+).

## Szybki start

```bash
npm install
cp .env.example .env          # uzupełnij JWT_SECRET (długi losowy ciąg)
docker compose up -d          # MongoDB
npm run start:dev
```

Sprawdzenie:

```bash
curl http://localhost:3000/api/v1/health   # liveness — { status:"ok", uptime, timestamp }
curl http://localhost:3000/api/v1/ready     # readiness — 200 { status:"ready", db:"up" } / 503 gdy baza down
```

Każda odpowiedź niesie nagłówek `x-request-id` (z żądania albo wygenerowany),
odbijany też w ciele błędów jako `requestId`; access-log loguje
`METODA ścieżka status czas rid=…`. Użyj `/health` do liveness, `/ready` do
readiness (np. w orchestratorze).

Dokumentacja API (interaktywna): **http://localhost:3000/api/docs**

## Architektura

Wszystkie endpointy pod `/api/v1`. Konfiguracja walidowana przy starcie (aplikacja nie wstanie z błędnym `.env`). Błędy w spójnym kształcie: `{ statusCode, message, error, path, timestamp }`.

```
src/
├── config/      # walidacja (Joi) i typowany odczyt env
├── common/      # guardy (Workspace, Roles), dekoratory (@Roles, @CurrentUser), filtr błędów, utils
├── health/      # liveness/readiness
├── auth/        # rejestracja, login, GitHub OAuth, JWT
├── users/       # użytkownicy
├── workspaces/  # workspace + role + izolacja tenantów + zarządzanie członkami
├── invitations/ # zaproszenia zespołu
├── api-keys/    # tokeny CI/CD + endpointy /ci
├── documents/   # pipeline .md, graf, broken-links, search, webhooki, publish
└── media/       # wolumeny (local/s3/ftp), assety, serwowanie publiczne
```

### Model bezpieczeństwa

- **Tożsamość:** JWT (`Authorization: Bearer <jwt>`) niesie wyłącznie `sub` (id użytkownika).
- **Izolacja tenantów:** `WorkspaceGuard` rozwiązuje `workspace_id` ze ścieżki `:id` lub nagłówka `X-Workspace-Id`, weryfikuje członkostwo i dociąga aktualną rolę przy każdym żądaniu.
- **RBAC:** role **Owner / Editor / Viewer** egzekwowane przez `@Roles()` + `RolesGuard`.
- **CI/CD:** osobne tokeny `dg_live_…` (`Authorization: Bearer dg_live_…`) walidowane przez `ApiKeyGuard`; w bazie tylko hash.
- **Sekrety:** hasła (bcrypt), tokeny zaproszeń i klucze CI/CD przechowywane wyłącznie jako hash (SHA-256); surowiec pokazywany raz.

## Endpointy

### Auth
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/auth/register` | rejestracja e-mail/hasło → JWT |
| POST | `/auth/login` | logowanie → JWT |
| GET | `/auth/github/login` | start OAuth GitHub |
| GET | `/auth/github/callback` | powrót OAuth → JWT |
| GET | `/auth/me` | profil + workspace'y (JWT) |
| GET | `/notification-preferences` | preferencje powiadomień usera (JWT) |
| PATCH | `/notification-preferences` | ustaw `{ emailEnabled, digestEnabled }` (JWT) |

### Workspaces / zespół (JWT, scoped do `:id`)
| Metoda | Ścieżka | Rola |
|---|---|---|
| POST | `/workspaces` | tworzy workspace |
| GET | `/workspaces/:id/members` | członek |
| PATCH | `/workspaces/:id/members/:userId` | Owner |
| DELETE | `/workspaces/:id/members/:userId` | Owner |

### Zaproszenia (JWT)
| Metoda | Ścieżka | Rola |
|---|---|---|
| POST | `/workspaces/:id/invitations` | Owner/Editor |
| GET | `/workspaces/:id/invitations` | Owner/Editor |
| DELETE | `/workspaces/:id/invitations/:invId` | Owner/Editor |
| POST | `/invitations/accept` | dowolny zalogowany (e-mail musi pasować) |
| GET | `/workspaces/:id/audit` | Owner — dziennik audytu (członkowie, zaproszenia, klucze API) |

### Tokeny CI/CD
| Metoda | Ścieżka | Auth |
|---|---|---|
| POST | `/workspaces/:id/api-keys` | JWT, Owner |
| GET | `/workspaces/:id/api-keys` | JWT, Owner |
| DELETE | `/workspaces/:id/api-keys/:keyId` | JWT, Owner |
| GET | `/ci/whoami` | token `dg_live_…` (weryfikacja połączenia) |

### Dokumenty (JWT Owner/Editor lub token CI)
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/workspaces/:id/documents` | dwufazowy zapis `{ file_path, content_raw }` (dysk + Mongo) |
| GET | `/workspaces/:id/documents` | lista dokumentów |
| GET | `/workspaces/:id/documents/by-path?path=…` | pełny dokument (HTML, metadata, linki) |
| GET | `/workspaces/:id/documents/health` | zwięzłe zdrowie docs (`ok`, broken/orphan/stale) — pod CI |
| GET | `/workspaces/:id/documents/feed.atom` | Atom feed ostatnio zmienionych dokumentów |
| GET | `/workspaces/:id/documents/export.html` | eksport całej dokumentacji do jednego, samowystarczalnego pliku HTML (read-only) |
| GET | `/workspaces/:id/documents/notifications` | powiadomienia odbiorcy (`?unread=1` — tylko nieprzeczytane) |
| GET | `/workspaces/:id/documents/notifications/count` | liczba nieprzeczytanych (`{ unread }`) |
| POST | `/workspaces/:id/documents/notifications/:uuid/read` | oznacz jedno jako przeczytane |
| POST | `/workspaces/:id/documents/notifications/read-all` | oznacz wszystkie jako przeczytane |
| GET | `/workspaces/:id/documents/broken-links` | raport zepsutych linków + propozycje naprawy |
| POST | `/workspaces/:id/documents/broken-links/fix` | napraw pojedynczy link `{ from, to }` |
| POST | `/workspaces/:id/documents/broken-links/fix-all` | napraw zbiorczo wszystkie rozwiązywalne linki (`{ fixedCount, skippedCount, fixed, skipped }`) |

### Bramka jakości w CI

`GET …/documents/health` zwraca `ok:false`, gdy są zepsute linki — działa z
tokenem `dg_live_…`, więc pipeline może **wywrócić build**, zanim czytelnik
trafi na 404:

```bash
WS=$(curl -fsS "$API/ci/whoami" -H "Authorization: Bearer $DG_TOKEN" | jq -r .workspaceId)
curl -fsS "$API/workspaces/$WS/documents/health" -H "Authorization: Bearer $DG_TOKEN" \
  | jq -e '.ok' >/dev/null || { echo "Broken documentation links — failing build"; exit 1; }
```

## Skrypty

| Polecenie | Opis |
|-----------|------|
| `npm run start:dev` | dev z hot-reload |
| `npm run build` / `start:prod` | kompilacja / uruchomienie produkcyjne |
| `npm run lint` / `format` | ESLint (0 warningów) / Prettier |
| `npm test` / `test:e2e` / `test:cov` | testy jednostkowe / e2e / pokrycie |

## Testy

- **Jednostkowe:** logika schematów i serwisów.
- **E2E (Supertest):** pełne przepływy — auth/JWT, OAuth (mock), RBAC, izolacja
  A/B, zaproszenia, tokeny CI/CD, dokumenty, media + przenoszenie między wolumenami,
  webhooki (HMAC), publish do Git (lokalne bare repo), auto-sync, reset hasła,
  rate limiting, scenariusze adversarialne (zob. `SECURITY.md`).

E2E **nie wymagają zewnętrznej bazy** — każdy plik testowy dostaje własny,
efemeryczny Mongo w pamięci (`mongodb-memory-server`), więc suite działa
lokalnie i w CI „z pudełka" i jest bezpieczny przy równoległym uruchomieniu.
Do debugowania możesz wskazać realny Mongo przez `MONGO_URI_TEST`.

```bash
npm test && npm run test:e2e          # in-memory Mongo, bez konfiguracji
MONGO_URI_TEST=mongodb://localhost:27017/dg_test npm run test:e2e  # realny Mongo
```

## Konfiguracja (env)

Zobacz `.env.example`. Kluczowe: `MONGO_URI`, `JWT_SECRET`, `MEDIA_SECRET`
(szyfrowanie poświadczeń wolumenów/push), `APP_URL`, `SMTP_*` (reset hasła),
`GITHUB_CLIENT_*`, `CORS_ORIGINS`, `THROTTLE_*`, `BCRYPT_ROUNDS`.

> **Bezpieczeństwo:** przed publicznym wdrożeniem przeczytaj [`SECURITY.md`](./SECURITY.md).

## Licencja

[PolyForm Noncommercial](./LICENSE).
