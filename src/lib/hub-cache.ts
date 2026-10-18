// Tiny in-memory TTL cache with a size bound. Pure (no I/O, no server-only) so it is unit-testable.
// Per server instance: it trades strict consistency for speed, with staleness bounded by the TTL.

export type TtlCacheOptions = {
  maxEntries: number;
  ttlMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
};

type Entry<V> = { value: V; expiresAt: number };

export class TtlCache<V> {
  private readonly map = new Map<string, Entry<V>>();

  private readonly options: TtlCacheOptions;

  constructor(options: TtlCacheOptions) {
    this.options = options;
  }

  private now() {
    return (this.options.now ?? Date.now)();
  }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V) {
    if (this.map.has(key)) this.map.delete(key); // re-insert so insertion order = recency
    else if (this.map.size >= this.options.maxEntries) this.prune();
    this.map.set(key, { value, expiresAt: this.now() + this.options.ttlMs });
  }

  delete(key: string) {
    this.map.delete(key);
  }

  /** Removes every entry whose value matches (used for targeted invalidation). */
  deleteWhere(predicate: (value: V) => boolean) {
    for (const [key, entry] of this.map) if (predicate(entry.value)) this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }

  /** Drops expired entries, then the oldest ones until there is room for one more. */
  private prune() {
    const now = this.now();
    for (const [key, entry] of this.map) if (entry.expiresAt <= now) this.map.delete(key);
    while (this.map.size >= this.options.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }
}
