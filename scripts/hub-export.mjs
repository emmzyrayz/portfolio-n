#!/usr/bin/env node
// Exports ONE tenant's hub data (tenant_users, app_config, mail_logs, telemetry_logs) for a client handover.
//
//   node scripts/hub-export.mjs <app-slug> [--out <dir>] [--include-sessions-count]
//
// Read-only: it only runs SELECTs. Reads DATABASE_URL_UNPOOLED (or DATABASE_URL) from the environment, or
// from .env.local if present. Never exports API key hashes, OTP hashes or session token hashes.
// Output: <out>/<slug>-<timestamp>/{manifest.json, tenant_users.json/.csv, app_config.json,
//         mail_logs.json/.csv, telemetry_logs.ndjson/.csv}
// The output contains personal data (end-user emails, mail recipients). Hand it over securely and delete your copy.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const outIndex = args.indexOf("--out");
const outRoot = outIndex >= 0 ? args[outIndex + 1] : "handover-exports";
if (!slug || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) {
  console.error("usage: node scripts/hub-export.mjs <app-slug> [--out <dir>]");
  process.exit(1);
}
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL).");
  process.exit(1);
}

const require = createRequire(path.join(process.cwd(), "package.json"));
const { neon } = require("@neondatabase/serverless");
const sql = neon(url);

const PAGE = 2000;
const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  // spreadsheet formula injection: a cell starting with = + - @ would be executed by Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csvLine = (columns, row) => columns.map((c) => csvCell(row[c])).join(",") + "\n";

async function write(stream, text) {
  if (!stream.write(text)) await once(stream, "drain");
}
async function close(stream) {
  stream.end();
  await once(stream, "finish");
}
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// Keyset-paginated read, so a huge table never has to fit in memory. The cursor is the timestamp as TEXT:
// a JS Date only has millisecond precision, Postgres has microseconds, and a truncated cursor would re-read
// rows that share a millisecond forever.
async function* pages(table, columns, appId) {
  const select = `SELECT ${columns.join(", ")}, created_at::text AS _ts FROM ${table}`;
  let cursor = null;
  for (;;) {
    const rows = cursor
      ? await sql.query(`${select} WHERE app_id = $1 AND (created_at, id) > ($2::timestamptz, $3::uuid) ORDER BY created_at, id LIMIT ${PAGE}`, [appId, cursor.ts, cursor.id])
      : await sql.query(`${select} WHERE app_id = $1 ORDER BY created_at, id LIMIT ${PAGE}`, [appId]);
    if (rows.length === 0) return;
    const last = rows[rows.length - 1];
    if (cursor && cursor.ts === last._ts && cursor.id === last.id) throw new Error(`pagination did not advance on ${table}; aborting`);
    cursor = { ts: last._ts, id: last.id };
    for (const row of rows) delete row._ts;
    yield rows;
    if (rows.length < PAGE) return;
  }
}

async function exportTable({ dir, table, columns, appId, json, csv }) {
  const csvPath = csv ? path.join(dir, `${table}.csv`) : null;
  const dataPath = path.join(dir, `${table}.${json}`);
  const data = createWriteStream(dataPath);
  const csvOut = csvPath ? createWriteStream(csvPath) : null;
  if (json === "json") await write(data, "[\n");
  if (csvOut) await write(csvOut, columns.join(",") + "\n");
  let count = 0;
  for await (const rows of pages(table, columns, appId)) {
    for (const row of rows) {
      if (json === "json") await write(data, (count > 0 ? ",\n" : "") + JSON.stringify(row));
      else await write(data, JSON.stringify(row) + "\n");
      if (csvOut) await write(csvOut, csvLine(columns, row));
      count += 1;
    }
  }
  if (json === "json") await write(data, "\n]\n");
  await close(data);
  if (csvOut) await close(csvOut);
  return { table, rows: count, files: [path.basename(dataPath), ...(csvPath ? [path.basename(csvPath)] : [])] };
}

const [app] = await sql.query("SELECT id, slug, name, kind, status, status_changed_at, created_at FROM apps WHERE slug = $1", [slug]);
if (!app) {
  console.error(`No app with slug "${slug}".`);
  process.exit(1);
}
if (app.kind !== "client") {
  console.error(`"${slug}" is not a client tenant (kind=${app.kind}). Refusing.`);
  process.exit(1);
}
if (app.status === "active") console.warn(`Warning: "${slug}" is still ACTIVE. Mark it handed over first so the data stops changing (see HUB_HANDOVER_PLAYBOOK.md).`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join(outRoot, `${slug}-${stamp}`);
mkdirSync(dir, { recursive: true });

const results = [];

// app_config is small: one JSON object keyed by config key, plus the raw rows
const config = await sql.query("SELECT key, value, updated_at FROM app_config WHERE app_id = $1 ORDER BY key", [app.id]);
writeFileSync(path.join(dir, "app_config.json"), JSON.stringify(config, null, 2) + "\n");
writeFileSync(path.join(dir, "app_config.flat.json"), JSON.stringify(Object.fromEntries(config.map((r) => [r.key, r.value])), null, 2) + "\n");
results.push({ table: "app_config", rows: config.length, files: ["app_config.json", "app_config.flat.json"] });

results.push(await exportTable({ dir, table: "tenant_users", appId: app.id, json: "json", csv: true, columns: ["id", "email", "role", "metadata", "created_at", "updated_at"] }));
results.push(await exportTable({ dir, table: "mail_logs", appId: app.id, json: "json", csv: true, columns: ["id", "recipient", "subject", "status", "error_message", "created_at"] }));
results.push(await exportTable({ dir, table: "telemetry_logs", appId: app.id, json: "ndjson", csv: true, columns: ["id", "event_type", "level", "message", "payload", "created_at"] }));

const manifest = {
  exportedAt: new Date().toISOString(),
  app: { slug: app.slug, name: app.name, status: app.status },
  note: "Contains personal data (end-user emails, mail recipients). Excludes API key, OTP and session token hashes.",
  tables: results.map((r) => ({
    ...r,
    sha256: Object.fromEntries(r.files.map((f) => [f, sha256(path.join(dir, f))])),
  })),
};
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`Exported "${slug}" to ${dir}`);
for (const r of results) console.log(`  ${r.table.padEnd(15)} ${String(r.rows).padStart(7)} rows`);
