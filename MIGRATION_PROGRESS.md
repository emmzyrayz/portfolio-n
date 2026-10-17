# Migration Progress

Last updated: 2026-10-17

## 1. Current state
- Fresh scaffold in this folder: Next.js 16.4.2 (App Router, Turbopack, `cacheComponents` + `partialPrefetching` on), React 19.3, Tailwind CSS v4, TypeScript 5, ESLint 9 flat config, pnpm.
- Baseline `pnpm lint` and `pnpm build` pass on the stock starter page.
- Old app (Next 14 / npm / MongoDB) lives in `C:\Codes\minimalist-portfolio`. Reusable UI is staged in its `migration/` folder; audit is in `migration/AUDIT.md`.
- Old server and database are gone.

### Security checklist (carried over from the audit)
- [ ] Revoke the old GitHub personal access token that was committed in `minimalist-portfolio` git history.
- [ ] Rotate / stop reusing the old JWT secret, encryption key, DB credentials and admin password.
- [ ] Never copy `.git` or any `.env*` from the old repo. This repo starts clean.
- [ ] Decide whether to purge the old repo history (`git filter-repo`) or make it private.

## 2. Product vision: portfolio + personal hub
- Public portfolio (no auth wall, no fake loader).
- Owner-only passwordless login (email OTP). Visitors do not sign in.
- `/dashboard` for the owner; `/dashboard/edit` edits everything visitors see on the portfolio.
- `/dashboard/cv`: paste a job description, Gemini API generates a tailored rich-text CV, editable and exportable.
- Later (Phase 5): multi-tenant hub services for side projects: auth scoped by `x-app-id`, email proxy, telemetry and remote config / feature flags. Every record carries `app_id` so satellite apps can be detached into their own DBs.

## 3. Decisions
| Topic | Decision |
|---|---|
| Hosting / DB | Vercel + Neon Postgres + Drizzle ORM |
| Email | Personal email via SMTP + Nodemailer, behind a single `sendMail()` interface (swappable for ZeptoMail/Resend) |
| Auth | Owner-only email OTP; hashed codes, 10 min expiry, 5 attempts, rate limited; signed httpOnly session cookie |
| Layout | Server-component root layout with `metadata`; Sora via `next/font/google` |
| Styling | Tailwind v4 CSS-first (`@theme` in `globals.css`), default breakpoints, no per-component CSS files |
| Content | Typed data in `src/content/` first (static fallback); DB-backed after Phase 3 |
| Projects | Server-side GitHub fetch with revalidation + static fallback |
| Contact | Server Action + `useActionState` + Nodemailer |
| Order | Public portfolio first, then auth, dashboard, CV builder, hub services |

## 4. Roadmap
- [x] Phase 0: baseline build/lint, this log
- [ ] Phase 0: `.env.example`, resolve scaffold notes below
- [ ] Phase 1: theme + layout + content files + ported sections + contact action
- [ ] Phase 2: Neon/Drizzle schema (`apps`, `users`, `otp_codes`, `sessions`) + OTP auth
- [ ] Phase 3: dashboard + `/dashboard/edit`
- [ ] Phase 4: CV builder (Gemini)
- [ ] Phase 5: hub services

## 5. Scaffold notes to resolve
- `package.json` lists `@tailwindcss/turbopack` and `next.config.ts` wires it as a CSS loader. Build works; confirm it is actually needed vs `@tailwindcss/postcss`.
- `pnpm-workspace.yaml` has `sharp: false`, so `next/image` optimisation may be limited. Decide whether to allow the build script.
- `cacheComponents` means DB/cookie reads must be under `<Suspense>` or `"use cache"`.

## 6. Next session starts at
Phase 1: `globals.css` theme tokens, Sora font + metadata in `layout.tsx`, `src/content/*`, port Hero/Skills/Experience/Projects.
