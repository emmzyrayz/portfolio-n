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
- [x] Phase 0: `.env.example`
- [x] Phase 1 (code complete, placeholder content): theme + layout + content files + ported sections + contact action. Lint/build pass; desktop checked in browser. TODO: check mobile widths, test a real SMTP send, replace all PLACEHOLDER content in `src/content/`, add `/resume.pdf` and set `profile.resumeUrl`, set `GITHUB_USERNAME` to pull real projects
- [x] Phase 2 COMPLETE: Neon project linked (`neon.ts`, `.neon`; `dev` branch, no TTL), Drizzle schema (`apps`, `users`, `otp_codes`, `sessions`, plus `rate_limits`) in `src/db/`, migration in `drizzle/`, owner-only OTP login (`src/app/actions/auth.ts`, `src/lib/{otp,session,dal,rate-limit,app}.ts`, `src/proxy.ts`, `/login`, placeholder `/dashboard`). Driver: `drizzle-orm/neon-http` on the pooled URL; migrations use `DATABASE_URL_UNPOOLED` (`pnpm db:generate`, `pnpm db:migrate`). Dev with SMTP unset logs the OTP to the server console. TODO: apply the migration to `production` before deploying; set `SESSION_SECRET`/`OWNER_EMAIL`/SMTP in Vercel; test one real SMTP OTP send.
- [x] Phase 3 COMPLETE (uncommitted; lint, build, migration and browser tests pass): DB-backed content with static fallback. Tables `site_profile`, `skills`, `experiences`, `featured_projects` plus a `content_sections` marker (row = customised, so an emptied list stays empty; deleting it = reset to defaults); migration `0001_careful_ricochet`. Public reads: `src/lib/content.ts` (`"use cache"` + `cacheTag("content:<section>")`, static fallback on no-row or DB error). Editor reads/writes: `src/lib/content-admin.ts` (each calls `verifyOwner()`). Actions: `src/app/actions/content.ts` (verify session, zod, `db.batch` with explicit `position`, `updateTag` + `revalidatePath("/")`; profile uses `revalidatePath("/", "layout")`). UI: `/dashboard` overview, `/dashboard/edit/{profile,skills,experience,projects}`. Projects precedence: saved featured projects, then GitHub, then static. Deferred: testimonials editor, image uploads (project image is an https URL or `/path`). TODO: apply migrations to `production`; replace placeholder content via the dashboard.
- [ ] Phase 4: CV builder (Gemini)
- [ ] Phase 5: hub services

## 5. Scaffold notes to resolve
- `package.json` lists `@tailwindcss/turbopack` and `next.config.ts` wires it as a CSS loader. Build works; confirm it is actually needed vs `@tailwindcss/postcss`.
- `pnpm-workspace.yaml` has `sharp: false`, so `next/image` optimisation may be limited. Decide whether to allow the build script.
- `cacheComponents` means DB/cookie reads must be under `<Suspense>` or `"use cache"`.

## 6. Next session starts at
Phase 4: CV builder (Gemini), reading profile/experience from the DB.

Notes: `_legacy/` (gitignored, excluded from tsconfig/eslint) holds the old UI for reference; delete when no longer needed. Dark mode intentionally dropped for now (light only). Remote project images use `unoptimized` because `sharp` is disabled.
