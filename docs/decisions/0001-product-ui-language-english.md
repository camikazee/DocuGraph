# ADR 0001 — Product / UI language is English

- **Status:** Accepted
- **Date:** 2026-07-19

## Context

DocuGraph is written by a Polish-speaking author but is meant to be a
portfolio-grade, GitHub-publishable product usable by an international audience.
The codebase is deliberately bilingual:

- **User-facing UI strings** (labels, buttons, placeholders, toasts, empty
  states, emails) — English.
- **Code comments, test descriptions, commit messages** — Polish, matching the
  author's working conventions.

An audit (2026-07-19) confirmed there are **no Polish user-facing strings** in
the frontend — every Polish token lives in comments or `it(...)` test names. So
the "EN/PL mix" the roadmap flagged is a code-vs-UI split, not a UI defect.

## Decision

The **product language is English**. We do **not** add an i18n library or a
locale/message-catalog layer at this time. UI strings stay inline in English.

- Any Polish (or other non-English) text that reaches a user-facing surface is
  treated as a **bug** to fix, not a translation to add.
- Comments, test names, and commit messages may remain Polish.

## Consequences

- **Cheapest path, zero runtime cost or dependency.** Nothing to migrate — the
  UI is already English.
- No multi-locale support (e.g. a Polish UI) until this decision is revisited.
- **If multi-locale is ever needed**, the migration path is the "scaffold"
  option we rejected today: adopt `next-intl`, extract strings to
  `messages/en.json`, add `messages/pl.json` + a language switcher, and migrate
  screen-by-screen. Revisit via a follow-up ADR.

## Enforcement

- Keep new UI strings in English.
- When touching a screen, if you spot a non-English user-facing string, fix it.
