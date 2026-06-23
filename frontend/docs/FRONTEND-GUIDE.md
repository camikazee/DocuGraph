# Frontend Guide — jak budujemy aplikacje frontowe

Konwencje dla frontu (Next.js App Router + TypeScript + Tailwind + motyw na tokenach
CSS). Przenośne — kopiuj do `docs/` każdego nowego frontu. Cel: spójność, reużywalność,
zero duplikacji surowego markupu.

---

## 1. Struktura katalogów

```
app/                 trasy (App Router): page.tsx, layout.tsx, error.tsx,
                     global-error.tsx, not-found.tsx, loading.tsx
components/ui/        PRYMITYWY bazowe (Button, Input, Card, Badge, Loader, …)
components/           KOMPOZYTY (AppShell, AuthForm, CommandPalette, ThemeProvider)
lib/                  logika nie-UI: api.ts, auth.ts, hooki (useProfile), utils (cn), walidacja
```

Zasada: **prymityw** = mały, bezstanowy, reużywalny klocek z `components/ui/`.
**Kompozyt** = składa prymitywy w większą całość. **Widok** (`app/.../page.tsx`) =
składa kompozyty/prymitywy + dane. Widok nigdy nie powtarza surowego markupu klocka.

---

## 2. Komponenty bazowe — jeden klocek, wszędzie ten sam

Mamy **jeden bazowy komponent** dla każdego typu i z niego wychodzimy dalej. Bazowy
komponent:
- **przyjmuje parametry (in)** przez propsy i **emituje (out)** przez callbacki
  (`onClick`, `onChange`, `onRetry`, …),
- **rozszerza natywne atrybuty** elementu (np. `extends React.ButtonHTMLAttributes`),
  żeby `type`, `disabled`, `aria-*` działały bez dodatkowej roboty,
- pozwala **nadpisać klasy** przez `className` scalane funkcją `cn()` (nigdy nie nadpisuje
  całości — dokleja),
- ma **warianty** zamiast kopii (np. `variant="primary" | "secondary"`).

Przykład (kontrakt Buttona):
```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  href?: string; // gdy podany → renderuje <a>, inaczej <button>
}
```

Reguła twarda: **nie pisz surowego `<button class="…">` ani `<input>` w widoku.**
Jeśli brakuje wariantu — dodaj wariant do bazowego komponentu, nie twórz kopii inline.
(Dług techniczny: starsze widoki miewają inline'owe przyciski — migruj je do `Button`
przy okazji dotykania pliku.)

Obecne prymitywy: `Button`, `Input`, `Card`, `Badge`, `Divider`, `Loader`/`Spinner`/
`Skeleton`, `Logo`/`LogoMark`, `Toast`, `NavLink`, `SidebarLink`, `NoAccess`, `icons`.

---

## 3. Formularze

- Walidacja **własna**, nie natywna — `<form noValidate>`; reguły w `lib/validation`.
- Pola przez `Input` (label + value + `onChange(value)` + `error`). Błąd pokazujemy
  stylowanym tekstem pod polem (`aria-invalid` na inpucie).
- Submit przez `Button type="submit"`; stan ładowania → `disabled` + tekst „Saving…".

---

## 4. Motyw (3 warianty na tokenach CSS)

- Kolory tylko przez **tokeny**: `bg, panel, card, line, line2, rowhover, fg, fg2, fg3,
  muted, acc, accfg, accsoft, capbg, capbd, inputbd, codebg` (mapowane na klasy Tailwind:
  `bg-bg`, `text-fg`, `border-line`, `bg-acc`, …).
- **Nie hardkoduj** kolorów hex w komponentach (wyjątek: `global-error.tsx`, które działa
  bez globals.css i musi mieć kolory inline).
- Motyw przełącza `ThemeProvider` + `ThemeSwitcher` (Light / Grey / Violet) ustawiając
  `data-theme`. Domyślny `:root` = violet.

---

## 5. Dane asynchroniczne → owijaj w `<Loader>`

Każdy fragment zależny od pobierania danych owijamy w `Loader` — jednolite stany
ładowania / błędu / pustki zamiast ad-hoc „Loading…".

```tsx
const [data, setData] = useState<Item[] | null>(null);  // null = ładowanie
const [error, setError] = useState<string | null>(null);

<Loader
  loading={data === null}
  error={error}
  empty={!!data && data.length === 0}
  onRetry={reload}
  emptyTitle="Nothing here yet"
  emptyMessage="Create your first item to get started."
>
  {data?.map((it) => <Row key={it.id} item={it} />)}
</Loader>
```

- `loading` → wyśrodkowany `Spinner` (lub własny `skeleton`),
- `error` → karta błędu + „Try again" (gdy podasz `onRetry`),
- `empty` → przyjazny pusty stan,
- inaczej → `children`.

Prymitywy pomocnicze: `Spinner` (samo kółko) i `Skeleton` (pulsujący placeholder) do
budowania własnych szkieletów listy.

---

## 6. Pozostałe konwencje

- **API**: tylko przez `apiFetch` z `lib/api` (dorzuca token, rzuca `ApiError` ze
  statusem). Błędy łap i pokazuj przez `Loader`/`Toast`.
- **Toasty**: `useToast().toast(msg, 'success' | 'error' | 'info')` — prawy górny róg.
- **Auth guard**: strony za logowaniem używają `useProfile()` (redirect na `/login`).
- **'use client'** tylko tam, gdzie jest stan/efekty/handlery.
- **Stany brzegowe tras**: `not-found.tsx`, `error.tsx`, `global-error.tsx` — wszystkie
  on-theme, z akcją powrotu/ponowienia.

---

## 7. Testy (Jest + React Testing Library)

- Komponenty renderowane w testach owijamy w potrzebne providery
  (`ThemeProvider`, `ToastProvider`).
- Mock `apiFetch` per ścieżka; mock `useRouter`/`getToken`.
- Co najmniej smoke test każdego nowego prymitywu i kluczowego widoku.

---

## Checklist nowego komponentu

- [ ] prymityw w `components/ui/`, kompozyt w `components/`
- [ ] propsy in + callbacki out, rozszerza natywne atrybuty, `className` przez `cn()`
- [ ] warianty zamiast kopii; zero hardkodowanych kolorów (tokeny)
- [ ] dane async owinięte w `<Loader>`
- [ ] smoke test (z providerami)
