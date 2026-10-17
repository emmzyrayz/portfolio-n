import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let client: ReturnType<typeof create> | undefined;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Pooled URL + stateless HTTP driver: right fit for serverless; no interactive transactions needed.
  return drizzle(neon(url), { schema });
}

/** Lazy so importing this module never throws at build time. */
export function getDb() {
  return (client ??= create());
}
