# DocuGraph — Security

Przegląd bezpieczeństwa backendu (audyt + testy adversarialne). Wykonano przed publicznym udostępnieniem.

## Model zabezpieczeń (skrót)

- **Uwierzytelnianie:** JWT (HS256, allowlista algorytmów) w `Authorization: Bearer`. Tokeny CI/CD `dg_live_…` w tym samym nagłówku, walidowane osobno.
- **Autoryzacja / multi-tenancy:** `WorkspaceGuard`/`CombinedAuthGuard` egzekwują członkostwo i wyłuskują `workspace_id` przy każdym żądaniu; `RolesGuard` + `@Roles` pilnują ról (Owner/Editor/Viewer).
- **Walidacja wejść:** globalny `ValidationPipe` z `whitelist` + `forbidNonWhitelisted` + `transform` (DTO `class-validator`).
- **Sekrety:** hasła (bcrypt), tokeny zaproszeń i klucze CI/CD — w bazie wyłącznie hash; surowiec pokazywany raz.
- **Sieć:** `helmet`, CORS (allowlista), rate limiting (`@nestjs/throttler`).

## Co zostało zweryfikowane testami włamaniowymi

Plik: `test/security.e2e-spec.ts` (+ `test/rate-limit.e2e-spec.ts`). Wszystkie scenariusze ataku są **odpierane**:

| Kategoria (OWASP API) | Atak | Wynik |
|---|---|---|
| API2 Broken Auth | brak / śmieciowy / `alg:none` / token podpisany złym sekretem | **401** |
| API1 BOLA | dostęp napastnika do cudzego workspace (członkowie, dokument, zapis) | **403** |
| API1 BOLA | token CI użyty na inny workspace | **403** |
| API5 BFLA | viewer próbuje akcji Owner/Editor (role, tokeny CI, zapis dokumentu) | **403** |
| API3 Mass assignment | rejestracja z `role`/`isAdmin`/`_id` | **400** (forbidNonWhitelisted) |
| API8 Injection (NoSQL) | login z `{$ne:…}` zamiast e-maila | **400** |
| API8 Injection (NoSQL) | `?path[$ne]=` w query | brak wycieku (4xx) |
| API3 Excessive Data | `passwordHash` / `keyHash` / `tokenHash` / surowy token w odpowiedzi | nieobecne |
| Path traversal | `../`, `a/../../b.md`, ścieżka absolutna | **400** |
| XSS (stored) | `<script>` i `javascript:` w Markdown | zneutralizowane w `content_html` |
| API4 Rate limiting | seria żądań ponad limit | **429** |

## Utwardzenia wykonane w ramach audytu

- JWT: wymuszona allowlista `algorithms: ['HS256']` w strategii Passport **i** w `CombinedAuthGuard` (blokuje alg-confusion / `alg:none`).
- `GET /documents/by-path`: wymuszenie, że `path` jest stringiem (defense-in-depth dla query-injection).
- CORS: brak łączenia `*` z `credentials` (auth jest na Bearer, nie cookie); ostrzeżenie przy `*` w produkcji.

## Rekomendacje przed produkcją

1. **Sekrety z menedżera sekretów**, nigdy z repo. `JWT_SECRET` długi i losowy (env już wymusza min. 16 znaków). Domyślny sekret w `docker-compose.yml` jest **tylko do podglądu**.
2. **CORS:** ustaw `CORS_ORIGINS` na konkretną domenę frontu (nie `*`).
3. **Rate limiting:** rozważ zaostrzenie limitu globalnego i/lub osobny, ostrzejszy limit na `/auth/login` i `/auth/register` (ochrona przed brute-force).
4. **Swagger (`/api/docs`):** rozważ wyłączenie lub zabezpieczenie poza środowiskiem dev.
5. **OAuth state:** przy domykaniu logowania GitHub/Slack włączyć parametr `state` (ochrona CSRF na callbacku).
6. **Enumeracja kont:** `POST /auth/register` zwraca 409 dla istniejącego e-maila (ujawnia istnienie konta). Akceptowalny kompromis; przy podwyższonych wymaganiach rozważyć neutralny komunikat.
7. **Renderowanie `content_html` na froncie:** sanitizować po stronie klienta (np. DOMPurify) jako druga warstwa obok bezpiecznego parsera.
8. **Twarde identyfikatory:** niepoprawny ObjectId w parametrach ścieżki kończy się 500 (CastError) — rozważyć `ParseObjectIdPipe` dla czystych 400 (kwestia jakości, nie wyciek).

## Zgłaszanie podatności

Znalazłeś problem bezpieczeństwa? Nie otwieraj publicznego issue — napisz na adres opiekuna repozytorium.
