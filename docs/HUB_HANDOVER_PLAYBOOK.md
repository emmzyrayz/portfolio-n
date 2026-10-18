# Client Handover & System Decoupling Playbook

How to move a contract project off the shared API Hub and onto the client's own infrastructure once the
engagement is paid and complete. Audience: the hub owner (you) and the client's developer.

> **The one thing that bites.** Marking a project "Handed over" **immediately revokes all of its API keys and
> signs out all of its end-users**. From that second the client's live site can no longer send mail, read
> config or authenticate users through the hub. So the order is: **build the replacement → cut over → *then*
> mark handed over**, never the other way round.

## 0. Timeline

| Step | When | Who |
|---|---|---|
| 1. Inventory what the project uses | T-14 days | owner |
| 2. Stand up standalone services + database on the client's infra | T-14 → T-3 | client dev (owner supports) |
| 3. Export + import data (rehearsal, then real) | T-3 → T-1 | owner + client dev |
| 4. Cut over (switch client app to its own services) | T-0 | client dev |
| 5. Mark **Handed over**, final delta export/import | T+0 (right after cutover) | owner |
| 6. Security checklist, written sign-off | T+0 → T+3 | both |
| 7. Delete the hub's copy of the data | T+30 (after sign-off) | owner |

## 1. Inventory

Open the project's card in `/dashboard/apps` and note which services it really uses:

- **Config & flags**: how many keys, which are read by the app (`app_config`).
- **Mail**: what is sent (receipts, OTP codes), expected volume, `mail_logs` size.
- **Telemetry**: do they want history (`telemetry_logs`, kept 30 days only), or just future logging.
- **Users & Directory**: how many end-users (`tenant_users`), roles/metadata in use.

Anything unused needs no replacement. The client's code reaches the hub through the SDK (`HubClient`), so
`grep -r "hub\." src/` in their repo is the exact list of call sites to re-point.

## 2. Standalone services

Two ways to replace the hub; pick one per service.

**A. Replace with managed services (recommended for most clients).** Config → their own env vars or a flag
service; mail → their own provider (Resend, Postmark, SES); telemetry → Sentry or similar; auth → Auth.js /
Clerk / their own OTP. Smallest long-term burden, no code copied from the hub.

**B. Re-host the hub's logic in their own backend, same URLs.** Copy the service logic below into their Next.js
or Express app, serve it at the same `/api/hub/v1/*` paths, and change one environment variable
(`HUB_BASE_URL`) in the client app. The SDK keeps working unchanged. This is the fastest cutover and is
described in section 5.

### Client infrastructure needed (either way)

- A Postgres database (Neon, Supabase, RDS...). Any Postgres 14+.
- An SMTP account or transactional mail provider **owned by the client** (do not hand over your Gmail).
- A new secret for signing tokens (`openssl rand -base64 48`). **Never reuse the hub's `HUB_JWT_SECRET`**: it
  signs every tenant's tokens.

## 3. Export the tenant's data

Everything is scoped by `app_id`, so one project's data can be separated cleanly. Never export other tenants'
rows; the script and queries below filter by the project.

### 3.1 The script (recommended)

```bash
# from the hub repo, with DATABASE_URL_UNPOOLED (or DATABASE_URL) set, e.g. in .env.local
node scripts/hub-export.mjs acme-store --out handover-exports
```

It is **read-only** (SELECTs only), refuses the internal `portfolio` app and any unknown slug, pages through
large tables, and writes `handover-exports/acme-store-<timestamp>/`:

| File | Contents |
|---|---|
| `tenant_users.json` / `.csv` | `id, email, role, metadata, created_at, updated_at` |
| `app_config.json`, `app_config.flat.json` | rows, and a ready-to-use `{ "key": value }` object |
| `mail_logs.json` / `.csv` | `id, recipient, subject, status, error_message, created_at` (no bodies were ever stored) |
| `telemetry_logs.ndjson` / `.csv` | one event per line (up to 30 days) |
| `manifest.json` | row counts and a SHA-256 of every file |

It deliberately **excludes** API key hashes, OTP hashes and session token hashes (useless and sensitive).
The output contains **personal data** (emails). `handover-exports/` is git-ignored: deliver it over an encrypted
channel, have the client verify the checksums in `manifest.json`, then delete your copy (section 7).
CSV cells that start with `= + - @` are prefixed with `'` so a malicious email cannot run as a spreadsheet formula.

### 3.2 Equivalent SQL (if you prefer psql)

```sql
-- find the tenant id once
SELECT id FROM apps WHERE slug = 'acme-store' AND kind = 'client';   -- => :app_id

\copy (SELECT id, email, role, metadata, created_at, updated_at FROM tenant_users WHERE app_id = :'app_id' ORDER BY created_at) TO 'tenant_users.csv' CSV HEADER
\copy (SELECT key, value, updated_at FROM app_config WHERE app_id = :'app_id' ORDER BY key) TO 'app_config.csv' CSV HEADER
\copy (SELECT id, recipient, subject, status, error_message, created_at FROM mail_logs WHERE app_id = :'app_id' ORDER BY created_at) TO 'mail_logs.csv' CSV HEADER
\copy (SELECT id, event_type, level, message, payload, created_at FROM telemetry_logs WHERE app_id = :'app_id' ORDER BY created_at) TO 'telemetry_logs.csv' CSV HEADER
```

Sanity check before delivering: row counts in the files match `SELECT count(*) ... WHERE app_id = :'app_id'`.

## 4. Import into the client's database

Single-tenant schema (no `app_id` needed): users and config are what matter; logs are optional history.

```sql
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'user',
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, code_hash text NOT NULL,
  expires_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_email_idx ON otp_codes (email);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_config (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mail_logs (id uuid PRIMARY KEY, recipient text, subject text, status text, error_message text, created_at timestamptz);
CREATE TABLE telemetry_logs (id uuid PRIMARY KEY, event_type text, level text, message text, payload jsonb, created_at timestamptz);
```

Load the JSON with a few lines of Node (idempotent, so the final delta import in step 5 can re-run it):

```js
import { readFileSync } from "node:fs";
import pg from "pg";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const dir = process.argv[2];
const read = (f) => JSON.stringify(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));

await db.query(`INSERT INTO users (id, email, role, metadata, created_at, updated_at)
  SELECT id, email, role, metadata, created_at, updated_at
  FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, email text, role text, metadata jsonb, created_at timestamptz, updated_at timestamptz)
  ON CONFLICT (email) DO NOTHING`, [read("tenant_users.json")]);
await db.query(`INSERT INTO app_config (key, value, updated_at)
  SELECT key, value, updated_at FROM jsonb_to_recordset($1::jsonb) AS x(key text, value jsonb, updated_at timestamptz)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`, [read("app_config.json")]);
await db.query(`INSERT INTO mail_logs SELECT * FROM jsonb_to_recordset($1::jsonb)
  AS x(id uuid, recipient text, subject text, status text, error_message text, created_at timestamptz) ON CONFLICT (id) DO NOTHING`, [read("mail_logs.json")]);
await db.end();
```

Keeping the original `id` values means any client table that stored a hub `user.id` as a foreign key keeps
working. Telemetry history is rarely worth importing (30-day retention); load the NDJSON the same way if wanted.

**Rehearse first**: import into a staging database, run the client app against it, then repeat for real.

## 5. Extract the service code (option B)

Re-host the hub endpoints inside the client's backend so the SDK needs only a new `HUB_BASE_URL`.

| Hub file (this repo) | Copy? | What to do |
|---|---|---|
| `src/lib/hub-auth-crypto.ts` | **as is** | Pure (only `node:crypto` + `jose`). OTP generation, HMAC hashing, JWT issue/verify. `npm i jose`. |
| `src/lib/hub-auth-schemas.ts`, `mail-schemas.ts`, `telemetry-schemas.ts`, `config-schemas.ts` | **as is** | Pure zod validation (`npm i zod`). Keeps the same request limits and error shapes. |
| `src/app/api/hub/v1/{auth,mail,telemetry,config}/**/route.ts` | adapt | Route handlers. Remove the `withHub(...)` wrapper (it is multi-tenant API-key auth) and the `app.id` / `key.id` arguments. |
| `src/lib/hub-auth.ts` | adapt | DB flows (`createOtp`, `verifyOtp`, `resolveSession`, `revokeSession`). Replace Drizzle/`app_id` with the client's DB access; keep the SQL idea of burning the attempt atomically (see note). |
| `src/lib/mail.ts` | adapt | `nodemailer` transport. Use the client's own SMTP credentials and `MAIL_FROM`. |
| `src/lib/rate-limit.ts` | optional | DB-backed counters. Keep (table `rate_limits`), or swap for the client's limiter (Redis/Upstash). Keep per-email OTP limits. |
| `src/lib/hub.ts`, `hub-state.ts`, `hub-keys.ts`, `hub-limiter.ts`, `dashboard/apps` | **do not copy** | Multi-tenant gateway, API-key hashing, owner UI. A single-tenant app does not need them. |

Behaviours worth keeping exactly (they are the security properties): the attempt counter is incremented in a
single `UPDATE ... WHERE id = (SELECT ...) AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
RETURNING`, **with the conditions repeated in the outer WHERE** (otherwise parallel guesses can exceed the cap);
the code hash is an HMAC bound to the email; every OTP failure returns the same `401 invalid_code`; the JWT is
pinned to HS256 with issuer/audience checks; the session row's `expires_at` and the JWT `exp` come from one
`Date`; `/me` always checks the session row and the user row.

### Express skeleton (OTP request + verify)

```ts
import express from "express";
import { generateOtp, hashOtp, otpMatches, sessionExpiry, issueToken, hashToken } from "./hub-auth-crypto";
import { otpRequestSchema, otpVerifySchema } from "./hub-auth-schemas";

const SECRET = process.env.AUTH_SECRET!;            // NEW secret, not the hub's
const APP = "acme-store";                           // fixed single tenant id, used only to bind the HMAC
const app = express().use(express.json({ limit: "1kb" }));

app.post("/api/hub/v1/auth/otp/request", async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", message: "The request body is invalid." } });
  const { email } = parsed.data;
  // TODO your rate limit: 3 requests / 10 min per email
  const code = generateOtp();
  await db.tx(async (t) => {                                          // a real transaction here: invalidate old + insert new
    await t.query("UPDATE otp_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL", [email]);
    await t.query("INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [email, hashOtp(SECRET, APP, email, code)]);
  });
  await sendMail({ to: email, subject: "Your sign-in code", text: `Your code is ${code}` });
  res.status(202).json({ ok: true, expiresInSeconds: 600 });
});

app.post("/api/hub/v1/auth/otp/verify", async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  const fail = () => res.status(401).json({ error: { code: "invalid_code", message: "The code is invalid or has expired." } });
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid_request", message: "The request body is invalid." } });
  const { email, code } = parsed.data;
  const { rows: [row] } = await db.query(
    `UPDATE otp_codes SET attempts = attempts + 1
     WHERE id = (SELECT id FROM otp_codes WHERE email = $1 AND consumed_at IS NULL AND expires_at > now() AND attempts < 5 ORDER BY created_at DESC LIMIT 1)
       AND consumed_at IS NULL AND expires_at > now() AND attempts < 5
     RETURNING id, code_hash`, [email]);
  if (!row || !otpMatches(SECRET, APP, email, code, row.code_hash)) return fail();
  const used = await db.query("UPDATE otp_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id", [row.id]);
  if (used.rowCount === 0) return fail();
  const { rows: [user] } = await db.query(
    "INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET updated_at = now() RETURNING id, email, role, metadata", [email]);
  const sessionId = crypto.randomUUID(), expiresAt = sessionExpiry();
  const token = await issueToken(SECRET, { userId: user.id, appId: APP, sessionId, expiresAt });
  await db.query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)", [sessionId, user.id, hashToken(SECRET, token), expiresAt]);
  res.json({ token, expiresAt: expiresAt.toISOString(), user });
});
```

`/me` and `/logout` follow the same pattern (`verifyToken`, then a `sessions JOIN users` lookup, then compare
`hashToken`). Mail, telemetry and config are plain CRUD plus validation with the copied zod schemas. Once these
routes are live, change `HUB_BASE_URL` in the client app; the client's `HUB_API_KEY` is no longer checked and can
be any placeholder (or add your own auth middleware).

## 6. Cut over and mark Handed over

1. Deploy the client app with the new base URL / new services. Test: flags load, a receipt email arrives, an error
   shows up in the new logger, sign-in works end-to-end.
2. **Existing end-user sessions will not carry over** (they are signed with the hub's secret, which you do not
   share). Tell the client to expect everyone to sign in once more with an emailed code. Their accounts (ids,
   roles, metadata) are preserved by the import.
3. In `/dashboard/apps`, open the project card and click **Mark handed over** → confirm. This, in one atomic step:
   revokes every API key, revokes every end-user session, and makes the hub reject the project. The card shows
   "Handed over" with the date.
4. Run the export a **second time** and import it (the import is idempotent) to catch users who registered
   between the first export and the cutover.
5. **Rollback** (only possible before step 3): point `HUB_BASE_URL` back to the hub. After step 3, "Reactivate"
   restores the project but **not its old keys or sessions**: create a new key if you ever need to resume.

## 7. Security checklist

Revoke and verify on the hub side:

- [ ] Project shows **Handed over** in `/dashboard/apps`; every key shows **Revoked**.
- [ ] A request with the old key now fails: `curl -i -H "x-app-id: acme-store" -H "Authorization: Bearer <old key>" https://<hub>/api/hub/v1/ping` returns `401`.
- [ ] `Users & Directory` for the project shows **0 active sessions**.
- [ ] No other project's data was in the export (spot-check emails against another tenant's directory).

Reissue secrets on the client's production server (the client does this, with new values):

- [ ] New token-signing secret: `openssl rand -base64 48` → `AUTH_SECRET` (or `HUB_JWT_SECRET` if they kept the name). **Never** the hub's value, never shared over chat or email.
- [ ] New SMTP credentials / provider API key owned by the client; SPF/DKIM/DMARC set up on their sending domain.
- [ ] Remove `HUB_API_KEY` and `HUB_APP_ID` from their environment variables and from CI/CD secrets once nothing calls the hub.
- [ ] Rotate any secret that was ever pasted into config values or logs (config should never have held secrets, but check `app_config.json`).
- [ ] Re-test sign-in, receipts and error logging in **production**, not just staging.

Close out on the hub side:

- [ ] Client confirms in writing that the import is complete and verified (row counts + `manifest.json` checksums).
- [ ] Delete your local copy of `handover-exports/` and any attachments (`shred`/secure delete; remove from backups where possible).
- [ ] Agree who is the data controller for the end-users after handover (the client) and give them the retention facts: mail logs 90 days, telemetry 30 days.
- [ ] After sign-off (suggest 30 days), delete the project's data from the hub. This is **irreversible**; run it as a transaction and check the counts before committing:

```sql
BEGIN;
SELECT slug, status FROM apps WHERE slug = 'acme-store';           -- must be kind=client, status=handed_over
SELECT (SELECT count(*) FROM tenant_users WHERE app_id = a.id) AS users,
       (SELECT count(*) FROM mail_logs WHERE app_id = a.id)    AS mail,
       (SELECT count(*) FROM telemetry_logs WHERE app_id = a.id) AS telemetry
FROM apps a WHERE slug = 'acme-store';
DELETE FROM apps WHERE slug = 'acme-store' AND kind = 'client' AND status = 'handed_over';  -- cascades to keys, config, users, sessions, codes, logs
COMMIT;   -- or ROLLBACK;
```

## 8. Quick reference

| I want to... | Do this |
|---|---|
| Stop a client's access *right now* (non-payment, leak) | `/dashboard/apps` → **Mark handed over** (or **Archive**); keys and sessions die immediately |
| Sign out one end-user | project card → Users & Directory → **Revoke sessions** |
| Remove one end-user's data (privacy request) | project card → Users & Directory → **Delete user** |
| Rotate a client's key without downtime | create a second key, deploy it, then revoke the old one |
| Export a project's data | `node scripts/hub-export.mjs <slug>` |
