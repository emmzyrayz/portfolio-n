# API Hub: Developer Integration Guide

How a client project plugs into the shared hub for remote config / feature flags, email, error telemetry and
passwordless sign-in. Written for the developer of the client app (Next.js, React, plain Node).

> **Golden rule.** The hub is **server-to-server**. Your API key is a secret that lives only on your
> backend. There is no CORS on the hub and no browser should ever see `hub_live_...`. Browsers talk to
> *your* backend; your backend talks to the hub.

```
Browser  ──►  your Next.js / Express backend  ──(x-app-id + API key)──►  Hub  (/api/hub/v1/*)
```

## 1. Get your credentials

The hub owner registers your project in `/dashboard/apps` and gives you:

| Item | Example | Where it goes |
|---|---|---|
| App id (slug) | `acme-store` | `HUB_APP_ID` |
| API key (shown once) | `hub_live_...` (52 chars) | `HUB_API_KEY` |
| Base URL | `https://nnamdiemmanueldike.vercel.app` | `HUB_BASE_URL` |

Store them as **server-only** environment variables (never `NEXT_PUBLIC_*`, never committed). If a key leaks,
ask the owner to revoke it and issue a new one: revocation works within seconds.

## 2. Install the SDK

Copy `packages/hub-sdk/index.ts` into your repo (e.g. `lib/hub-sdk.ts`). There is nothing to install.

```ts
// lib/hub.ts  (server-only module)
import "server-only"; // Next.js: fails the build if a client component imports this
import { HubClient } from "./hub-sdk";

export const hub = new HubClient({
  appId: process.env.HUB_APP_ID!,
  apiKey: process.env.HUB_API_KEY!,
  baseUrl: process.env.HUB_BASE_URL,
});
```

Node.js / Express: the same file without the `server-only` import. For plain-JS Node, run with a TypeScript
runner (`tsx`, or Node 22.6+ `--experimental-strip-types`) or compile the file once.

## 3. Feature flags and remote config

Config is a flat key/value map the owner edits in the dashboard (values are JSON). `config.get()` sends
`If-None-Match`, so unchanged config costs one tiny `304`.

```ts
// lib/flags.ts
import { hub } from "./hub";

const DEFAULTS = { "flags.new_checkout": false, "limits.max_items": 25 } as const;

export async function getFlags() {
  try {
    const { config } = await hub.config.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...config } as typeof DEFAULTS;
  } catch {
    return DEFAULTS; // the hub being down must never take your site down
  }
}
```

```tsx
// app/checkout/page.tsx (Server Component)
const flags = await getFlags();
return flags["flags.new_checkout"] ? <NewCheckout /> : <OldCheckout />;
```

Notes: the SDK's ETag cache lives in process memory, so on serverless it helps only while an instance is warm;
wrap `getFlags()` in your framework's cache (e.g. `"use cache"` with a short `cacheLife`) to avoid a request
per page view. Config changes reach the hub's own edge within ~30 s. **Never put secrets in config.**

## 4. Send booking / order receipts

Each recipient gets their own message, sent from the hub's mail account with **your project's name** as the
sender name. Limits: up to 5 recipients per call, subject ≤ 200 chars, body ≤ 100 KB, and a shared budget of
**50 recipients per hour** per project.

```ts
// app/actions/orders.ts
"use server";
import { hub } from "@/lib/hub";
import { HubError } from "@/lib/hub-sdk";

export async function emailReceipt(order: { id: number; email: string; total: string }) {
  try {
    const res = await hub.mail.send({
      to: order.email,
      subject: `Your receipt for order #${order.id}`,
      text: `Thank you! Order #${order.id}, total ${order.total}.`,
      html: `<h1>Thank you!</h1><p>Order <b>#${order.id}</b>, total ${order.total}.</p>`,
      replyTo: "support@acme.example",
    });
    return { sent: res.ok };
  } catch (error) {
    if (error instanceof HubError && error.isRetryable) {
      // 429 quota / 502 delivery failed / 503 mail unavailable: queue it and try again later
      return { sent: false, retryAfterSeconds: error.retryAfterSeconds ?? 60 };
    }
    throw error; // 400/401: a bug or a config problem, surface it
  }
}
```

A `207` partial success (some recipients failed) returns normally with `ok: false`; inspect `results[i].status`.
Do not put one-time codes or passwords in `mail.send`: use `auth` (section 7), which does it properly.

## 5. Capture errors and events (telemetry)

`telemetry.log()` is synchronous, queues in memory, sends in batches (10 events or 2 s) and **never throws**.
Messages are cut at 2000 chars, payloads sanitised to the hub limits (≤ 8 KB, ≤ 6 levels deep). The hub also
redacts secret-looking keys and tokens, but do not log personal data on purpose. Quota: **500 events/hour**.

### On the server

```ts
import { after } from "next/server";
import { hub } from "@/lib/hub";

export async function POST(request: Request) {
  try {
    /* ... */
  } catch (error) {
    hub.telemetry.log("error", "api.orders.create_failed", (error as Error).message, { error }); // stack is captured
    after(() => hub.telemetry.flush()); // serverless: send before the function is frozen
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
```

On Node servers you can also report crashes and unhandled rejections (it only observes; it does not swallow
the error or change Node's exit behaviour):

```ts
hub.telemetry.attachGlobalErrorListener(); // call once at startup (e.g. instrumentation.ts)
```

### In the browser: the same-origin relay (~15 lines)

A browser must not hold the key, so give it a **key-less** client that posts to *your own* route, which
forwards to the hub. Create the relay once:

```ts
// app/api/telemetry/route.ts
import { hub } from "@/lib/hub";

const LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") !== "same-origin") return new Response(null, { status: 403 });
  const raw = await request.text();
  if (raw.length > 32_000) return new Response(null, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const events = (Array.isArray(body) ? body : [body]).slice(0, 10).flatMap((e) =>
    e && typeof e === "object" && LEVELS.has(e.level) && typeof e.message === "string" && typeof e.event_type === "string"
      ? [{ event_type: e.event_type.slice(0, 64), level: e.level, message: e.message.slice(0, 2000), payload: e.payload && typeof e.payload === "object" && !Array.isArray(e.payload) ? e.payload : undefined }]
      : []);
  if (events.length) await hub.telemetry.ingest(events).catch(() => {}); // telemetry is best effort
  return new Response(null, { status: 204 });
}
```

Then the browser side:

```tsx
// app/telemetry-provider.tsx
"use client";
import { useEffect } from "react";
import { HubClient } from "@/lib/hub-sdk"; // the SDK file is safe to import in the browser: it holds no secret

export const browserHub = HubClient.forBrowser({ relayUrl: "/api/telemetry" });

export function TelemetryProvider() {
  useEffect(() => browserHub.telemetry.attachGlobalErrorListener(), []); // returns its own cleanup
  return null;
}
```

```tsx
// app/error.tsx: React render errors
"use client";
import { browserHub } from "./telemetry-provider";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  browserHub.telemetry.log("error", "ui.render_failed", error.message, { error, digest: error.digest });
  return <p>Something went wrong.</p>;
}
```

The relay is reachable by anyone who can reach your site, so a bot could spend your 500/hour budget with junk.
The `sec-fetch-site` check and the size/shape limits above stop casual abuse; for a public site add your own
rate limit (per IP) in front of it. It is *not* an authentication boundary, which is why it can only ever write
telemetry and never read or send anything else.

## 6. React (SPA) and other frontends

A client-only React app (Vite, CRA) has no backend, so it **cannot** hold a key. Put a small backend in front
(Next.js route handlers, Express, a serverless function) and have the SPA call that. The browser client above
(`HubClient.forBrowser`) is the only part of the SDK that belongs in a browser.

## 7. Passwordless sign-in for your end-users (OTP)

The hub emails a 6-digit code (valid 10 minutes, 5 wrong attempts kill it) and returns a session token valid for
7 days. Your backend keeps that token in an `httpOnly` cookie. Sign-up is open: whoever proves they own an inbox
becomes a user of *your* project (users of other projects are separate, even with the same email).

```ts
// app/actions/auth.ts
"use server";
import { cookies } from "next/headers";
import { hub } from "@/lib/hub";
import { HubError } from "@/lib/hub-sdk";

export async function requestCode(email: string) {
  try {
    await hub.auth.requestOtp(email); // always succeeds the same way: does not reveal who has an account
    return { ok: true };
  } catch (e) {
    if (e instanceof HubError && e.status === 429) return { ok: false, message: `Too many requests. Try again in ${e.retryAfterSeconds ?? 60}s.` };
    if (e instanceof HubError && e.status === 400) return { ok: false, message: "Enter a valid email address." };
    return { ok: false, message: "We could not send a code right now." };
  }
}

export async function verifyCode(email: string, code: string) {
  try {
    const { token, expiresAt } = await hub.auth.verifyOtp(email, code);
    (await cookies()).set("session", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(expiresAt) });
    return { ok: true };
  } catch (e) {
    if (e instanceof HubError && e.status === 401) return { ok: false, message: "That code is wrong or has expired." }; // same for every cause
    if (e instanceof HubError && e.status === 429) return { ok: false, message: "Too many attempts. Wait a few minutes." };
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

export async function getUser() {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;
  try {
    return (await hub.auth.me(token)).user; // checked against the hub's database on every call
  } catch (e) {
    if (e instanceof HubError && e.status === 401) return null; // logged out, revoked or expired
    throw e;
  }
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (token) await hub.auth.logout(token).catch(() => {}); // idempotent
  jar.delete("session");
}
```

Express equivalent: replace `cookies()` with `res.cookie("session", token, { httpOnly: true, secure: true, sameSite: "lax", expires })`
and `req.cookies.session` (with `cookie-parser`).

Behaviour to design around:

- Per email: **3 code requests and 10 verify calls per 10 minutes**; a new request cancels the previous code.
- The sign-in email counts against your project's 50-recipients-per-hour mail budget, so a login flood can also
  stop receipts. Rate-limit your own login form (per IP) as well.
- `me()` hits the hub every time. Cache the result for the request (React `cache()`), not across requests, so
  revocation stays immediate.
- There is no refresh token: after 7 days the user signs in again. `user.role` and `user.metadata` are set by the
  hub owner, not by your app.

## 8. Error handling

Every failure is a `HubError`: `status`, `code`, `message` (generic), optional `fields` (400),
`retryAfterSeconds` (429), and `isRetryable`.

| Status | `code` | Meaning | What to do |
|---|---|---|---|
| **400** | `invalid_request` | The payload failed validation. `fields` lists *names* (e.g. `["to", "subject"]`), never values. | Fix the caller. Show a field error to the user if the field came from a form. Never retry unchanged. |
| **401** | `unauthorized` | Wrong/revoked key, wrong app id, or the project was handed over/archived. | A configuration problem, not a user problem. Alert yourself, serve the fallback, do **not** retry in a loop. |
| **401** | `invalid_code` / `invalid_token` | OTP wrong, expired, used or locked / end-user token invalid, revoked or expired. | Ask the user to try again or sign in again. The reason is deliberately not revealed. |
| **413** | `payload_too_large` | Body too big. | Shrink it. |
| **429** | `rate_limited` / `quota_exceeded` | Per-minute key limit, per-email limit, or an hourly/daily quota. `retryAfterSeconds` is set. | Wait that long; back off; queue non-urgent work. |
| **502/503/network** | `delivery_failed`, `mail_unavailable`, `network_error`, `timeout` | Upstream problem. `isRetryable` is `true`. | Retry later with backoff. |

A reusable wrapper:

```ts
import { HubError } from "./hub-sdk";

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof HubError) || !error.isRetryable || i >= attempts - 1) throw error;
      const wait = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 500 * 2 ** i;
      await new Promise((r) => setTimeout(r, Math.min(wait, 15_000)));
    }
  }
}

export function userMessage(error: unknown): string {
  if (error instanceof HubError) {
    if (error.status === 400) return "Please check the highlighted fields.";
    if (error.status === 429) return "Too many requests. Please try again shortly.";
    if (error.status === 401) return "This service is temporarily unavailable."; // and alert the developers
  }
  return "Something went wrong.";
}
```

Only wrap idempotent work (config reads, `requestOtp`). Do **not** auto-retry `mail.send` after a timeout
without thinking: the first attempt may have been delivered.

## 9. Limits at a glance

| Area | Limit |
|---|---|
| All endpoints | Per-key requests per minute (set by the owner, default 60) |
| Config | Read-only; values are owner-edited JSON |
| Mail | ≤ 5 recipients/call, 100 KB body, **50 recipients/hour/project** (+ a global daily cap) |
| Telemetry | ≤ 10 events/request, payload ≤ 8 KB, **500 events/hour/project**, 30-day retention |
| OTP | 3 requests + 10 verifies per email per 10 min; code valid 10 min, 5 attempts; session 7 days |

## 10. Pre-launch checklist

- [ ] `HUB_API_KEY` exists only in server environment variables, not in the repo, not `NEXT_PUBLIC_*`.
- [ ] Nothing that imports `lib/hub.ts` is a client component (`server-only` guards this).
- [ ] Every hub call has a fallback or error path; the site works with the hub unreachable.
- [ ] Your login and relay routes have their own rate limits.
- [ ] You know who to contact to revoke a leaked key.
