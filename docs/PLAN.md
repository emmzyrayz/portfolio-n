# Portfolio Hub: Roadmap & First Build Plan

## Context
The old portfolio (Next 14 / npm / Mongo, site-wide auth wall, fake loader, placeholder content) is being replaced in `C:\Codes\portfolio` (fresh Next 16.4 / React 19.3 / Tailwind 4 / pnpm, `src/` + `@/*`, scaffold only, git repo already initialised). Old reusable UI is staged in `C:\Codes\minimalist-portfolio\migration\` (see `AUDIT.md`). Vision: not just a static portfolio but a personal hub: public portfolio, owner-only OTP login, `/dashboard` with `/dashboard/edit` (edit all public content) and a Gemini-powered CV builder. Later: multi-tenant hub services for side projects (auth by `x-app-id`, email proxy, remote config/flags).

Decisions made: Vercel + Neon Postgres + Drizzle; owner-only passwordless OTP login; SMTP via personal email (Nodemailer); build public portfolio first.

Scaffold facts to respect: `next.config.ts` has `cacheComponents: true` + `partialPrefetching` (dynamic data like cookies/DB must sit under `<Suspense>` or `"use cache"`); `pnpm-workspace.yaml` has `sharp: false` (decide whether to allow it for `next/image` optimisation); `package.json` lists `@tailwindcss/turbopack` which must be verified to resolve (unusual package).

## Phases

### Phase 0 - Housekeeping (first)
- Write `MIGRATION_PROGRESS.md` in `C:\Codes\portfolio` (content from the Gemini brief, corrected: scaffold is already done; credentials purge is the user's claim, so keep "rotate the leaked tokens" as a checklist item; owner-only auth replaces "multi-tenant visitor auth" for now).
- `pnpm dev` / `pnpm build` / `pnpm lint` baseline; confirm `@tailwindcss/turbopack` and cacheComponents behave on the stock page.
- `.env.example` + `.env.local` (gitignored). Never commit env files.

### Phase 1 - Foundation + public portfolio (static content)
- `app/globals.css`: Tailwind v4 `@theme` tokens (colors from old `--black/--white/--zinc-*`, Sora via `next/font/google` in a server-component `app/layout.tsx` with real `metadata`). Keep default breakpoints (old `screens` override is dropped); keep text-outline and slide/fade keyframes.
- Content as typed data in `src/content/` (`profile.ts`, `skills.ts`, `experience.ts`, `projects.ts`, `testimonials.ts`) so Phase 4 can swap the source to the DB without touching components.
- Port from `migration/components` into `src/components/*.tsx` (not `page.tsx` names): Navbar (real `#anchors`, accessible button), Show/hero (no `dangerouslySetInnerHTML`), Skills, Experience (real data), About, Projects, Testimonial, Footer, Resume (static PDF in `public/`), Contact. Reuse `assets/icons/*.tsx` SVGs and `img/`. One shared `useInView` hook replaces the three copied IntersectionObservers. Only the animated bits are client components.
- Projects: server-side GitHub fetch with `revalidate`/`"use cache"` + static fallback array; no client `/api/project`; drop lodash.
- Contact: Server Action + `useActionState` + Nodemailer SMTP, zod validation, honeypot/rate limit.
- No loader gate, no auth wall.

### Phase 2 - Data layer + OTP auth (owner-only)
- Neon + Drizzle (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`); schema from day one tenant-aware: `apps`, `users` (with `app_id`), `otp_codes` (hashed code, expiry, attempts), `sessions`, plus `content` tables later. Default app = the portfolio itself.
- OTP flow: email form -> server action; only allow-listed owner email (`OWNER_EMAIL` env) triggers a send but respond identically either way (no enumeration); 6-digit code hashed, 10-min expiry, 5 attempts, per-email/IP rate limit; verify -> session.
- Sessions: signed httpOnly cookie (`jose`) + DB session row; check in a `dal.ts` (`verifySession`) used by dashboard pages/actions (not only middleware/`proxy.ts`).
- Routes: `/login`, `/dashboard` guarded.

### Phase 3 - Dashboard & content editing
- `/dashboard` overview, `/dashboard/edit` with section forms (profile, skills, experience, projects, testimonials, socials) writing to Postgres; public pages read via `"use cache"` with tags + `revalidateTag` on save. Static `src/content` stays as seed/fallback.
- Image uploads: Vercel Blob (decide at this phase).

### Phase 4 - CV builder
- `/dashboard/cv`: paste job description -> Server Action calls Gemini API (`@google/genai`, key in env, server only) with profile/experience from DB as grounding -> returns structured JSON -> rich-text editor (Tiptap) -> export PDF (print stylesheet or `@react-pdf/renderer`). Save CV versions per job in DB. Prompt must forbid inventing experience; show diff vs. source data.

### Phase 5 - Hub services (later)
- `x-app-id` scoped API routes: auth engine, email proxy (reusing the SMTP module), telemetry + remote config/flags. Every row carries `app_id`. Own roadmap session before starting.

## Risks / notes
- Personal-email SMTP (e.g. Gmail app password) has daily send limits and weaker deliverability for OTPs; fine for owner-only, revisit before multi-tenant. Keep the mailer behind one `sendMail()` interface so ZeptoMail/Resend can drop in.
- Old `.env` secrets existed in git history of `minimalist-portfolio`; the new repo must start clean (don't copy `.git` or `frontend/.env*`).
- Gemini key and SMTP creds only in Vercel/`.env.local`.

## Verification
- Phase 0/1: `pnpm lint && pnpm build`; `pnpm dev` and visually compare each section at mobile/desktop vs old site (screenshots via browser tools); Lighthouse a11y/SEO; contact action sends a real test mail.
- Phase 2: unit tests for OTP hash/expiry/attempt limits (Vitest); manual: non-owner email gets no mail but same response, wrong code x5 locks, expired code fails, `/dashboard` redirects when logged out.
- Phase 3: edit a field in `/dashboard/edit`, confirm public page updates after revalidation.
- Phase 4: paste sample JD, confirm CV references only real profile data and exports.

## Immediate next step on approval
Execute Phase 0, then Phase 1 (theme + layout + content files + ported sections), ending with a passing `pnpm build`.
