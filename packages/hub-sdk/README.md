# Hub SDK

A single-file, zero-dependency TypeScript client for the API Hub (`/api/hub/v1/*`): remote config / feature
flags, email, telemetry and passwordless end-user auth.

- Runtime: Node 18+, edge runtimes, modern browsers (global `fetch` only).
- **Server-side only**, with one exception: `HubClient.forBrowser()` is a key-less, telemetry-only client that
  talks to your own same-origin relay route. The hub has no CORS and an API key must never reach a browser.

## Copy-in setup

1. Copy `packages/hub-sdk/index.ts` into your project, e.g. `lib/hub-sdk.ts` (nothing else to install).
2. Ask the hub owner for a project: an **app id** (the slug) and an **API key** (`hub_live_...`, shown once).
3. Put them in server-only environment variables:

   ```bash
   HUB_APP_ID=your-project-slug
   HUB_API_KEY=hub_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   HUB_BASE_URL=https://nnamdiemmanueldike.vercel.app   # optional, this is the default
   ```

4. Create one shared instance:

   ```ts
   // lib/hub.ts
   import { HubClient } from "./hub-sdk";

   export const hub = new HubClient({
     appId: process.env.HUB_APP_ID!,
     apiKey: process.env.HUB_API_KEY!,
     baseUrl: process.env.HUB_BASE_URL,
   });
   ```

5. Use it:

   ```ts
   const { config } = await hub.config.get(["flags.new_checkout"]);
   await hub.mail.send({ to: "guest@example.com", subject: "Your receipt", text: "Thanks!" });
   hub.telemetry.log("error", "checkout.failed", "Payment declined", { orderId: 42 });
   const { token, user } = await hub.auth.verifyOtp(email, code);
   ```

Full walkthrough, error handling and the browser relay route: `docs/HUB_INTEGRATION_GUIDE.md`.

## API at a glance

| Call | Returns | Notes |
|---|---|---|
| `config.get(keys?)` | `ConfigResult` | ETag / `304`; `fromCache: true` when unchanged |
| `mail.send({ to, subject, text?, html?, replyTo? })` | `MailResult` | up to 5 recipients, each gets their own message |
| `telemetry.log(level, eventType, message, payload?)` | `void` | queued, batched (10 / 2 s), never throws |
| `telemetry.flush()` | `Promise<void>` | call before a serverless function returns |
| `telemetry.ingest(events)` | `{ accepted }` | immediate send; used by relay routes |
| `telemetry.attachGlobalErrorListener()` | `() => void` | browser: `error` + `unhandledrejection`; Node: uncaught exception (observe only) + unhandled rejection |
| `auth.requestOtp(email)` | `{ expiresInSeconds }` | identical answer for every address |
| `auth.verifyOtp(email, code)` | `{ token, expiresAt, user }` | |
| `auth.me(token)` / `auth.logout(token)` | `{ user, session }` / `void` | |

Every failure is a `HubError` (`status`, `code`, `fields?`, `retryAfterSeconds?`, `isRetryable`).
