// Per-instance rate limiter that decides instantly and learns the durable (database) count afterwards.
// Pure (no I/O, no server-only) so it is unit-testable; the DB write lives in src/lib/hub.ts.
//
// How it works: take() counts the request locally and allows/denies it with no I/O. After the response,
// the caller writes the durable counter and feeds the result back through syncGlobal(), so limits hold
// across server instances with a lag of about one request. Trade-off: a limit can be overshot by roughly
// one in-flight request per instance, in exchange for taking the database off the critical path.

export type LimiterOptions = {
  windowMs: number;
  maxEntries: number;
  now?: () => number;
};

export type LimitDecision = {
  allowed: boolean;
  /** Requests left in the window (0 when denied). */
  remaining: number;
  /** Seconds until the window resets (at least 1). */
  retryAfterSeconds: number;
};

type Entry = {
  windowStart: number;
  /** Requests this instance has allowed in its window. */
  local: number;
  /** Last durable count reported by the database, valid until globalEndsAt. */
  global: number;
  globalEndsAt: number;
  /** Requests allowed since the last sync (the database has not seen them yet). */
  pending: number;
};

export class HubLimiter {
  private readonly entries = new Map<string, Entry>();

  private readonly options: LimiterOptions;

  constructor(options: LimiterOptions) {
    this.options = options;
  }

  private now() {
    return (this.options.now ?? Date.now)();
  }

  private entry(id: string, now: number): Entry {
    let entry = this.entries.get(id);
    if (!entry || now - entry.windowStart >= this.options.windowMs) {
      if (!entry && this.entries.size >= this.options.maxEntries) this.prune(now);
      entry = { windowStart: now, local: 0, global: 0, globalEndsAt: 0, pending: 0 };
      this.entries.set(id, entry);
    }
    return entry;
  }

  /**
   * Counts `cost` units (default 1) and decides immediately, all-or-nothing: a request that does not fit
   * takes nothing. Denied requests are not counted (nothing to sync).
   */
  take(id: string, limit: number, cost = 1): LimitDecision {
    const now = this.now();
    const entry = this.entry(id, now);

    // Two views of usage: what this instance allowed itself, and what the database last said (plus what
    // this instance has allowed since, which the database has not seen yet). The stricter one wins.
    const globalValid = now < entry.globalEndsAt;
    const globalView = globalValid ? entry.global + entry.pending : 0;
    const used = Math.max(entry.local, globalView) + cost; // usage in the window if this request is admitted
    const windowEnd = globalView > entry.local ? entry.globalEndsAt : entry.windowStart + this.options.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));

    if (used > limit) return { allowed: false, remaining: 0, retryAfterSeconds };

    entry.local += cost;
    entry.pending += cost;
    return { allowed: true, remaining: Math.max(0, limit - used), retryAfterSeconds };
  }

  /** Gives back units taken by take() (e.g. when a second budget rejects the same request). */
  refund(id: string, cost: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.local = Math.max(0, entry.local - cost);
    entry.pending = Math.max(0, entry.pending - cost);
  }

  /** Feeds back the durable counter (count in the DB's window, and when that window ends). */
  syncGlobal(id: string, count: number, windowEndsAt: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.global = count;
    entry.globalEndsAt = windowEndsAt;
    entry.pending = 0;
  }

  get size() {
    return this.entries.size;
  }

  private prune(now: number) {
    for (const [id, entry] of this.entries) if (now - entry.windowStart >= this.options.windowMs) this.entries.delete(id);
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
