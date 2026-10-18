/**
 * Hub SDK: a zero-dependency client for the API Hub (/api/hub/v1/*).
 *
 * SERVER-SIDE ONLY for everything except telemetry. The API key is a secret: never ship it to a browser.
 * Browsers get a key-less, telemetry-only client that talks to YOUR OWN same-origin relay route
 * (see docs/HUB_INTEGRATION_GUIDE.md): `HubClient.forBrowser({ relayUrl: "/api/telemetry" })`.
 *
 * Works on Node 18+, edge runtimes and modern browsers (uses fetch + AbortController only).
 * Written to be copied into a project as a single file. No parameter properties or enums, so it also runs
 * under Node's built-in TypeScript type stripping.
 */

/* ----------------------------------------------------------------------------------------------- types */

export type Level = "debug" | "info" | "warn" | "error" | "fatal";

export type HubClientOptions = {
  /** The tenant slug sent as `x-app-id`. */
  appId: string;
  /** `hub_live_...`. Server-side only. */
  apiKey: string;
  /** Default: https://nnamdiemmanueldike.vercel.app */
  baseUrl?: string;
  /** Inject a fetch implementation (tests, custom agents). Default: global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout. Default 10 000 ms (mail: 30 000 ms). */
  timeoutMs?: number;
  telemetry?: TelemetryOptions;
};

export type BrowserClientOptions = {
  /** Your own same-origin route that forwards to the hub, e.g. "/api/telemetry". Holds no secrets. */
  relayUrl: string;
  fetch?: typeof fetch;
  telemetry?: TelemetryOptions;
};

export type TelemetryOptions = {
  /** Max events per request (hub limit is 10). Default 10. */
  batchSize?: number;
  /** Flush a non-empty queue after this long. Default 2000 ms. 0 disables the timer (call flush()). */
  flushIntervalMs?: number;
  /** Queue cap; the oldest events are dropped beyond it so an outage cannot grow memory. Default 100. */
  maxQueue?: number;
  /** Called when events are dropped or a flush fails permanently. Never throws into your app. */
  onError?: (error: HubError | Error, droppedEvents: number) => void;
};

export type ConfigResult = {
  app: string;
  /** Changes whenever the owner edits any config key. */
  version: string;
  updatedAt: string | null;
  config: Record<string, unknown>;
  /** True when the hub answered 304 and this is the locally cached copy. */
  fromCache: boolean;
};

export type MailMessage = {
  /** One address, or up to 5. Each recipient receives their own message. */
  to: string | string[];
  subject: string;
  /** At least one of text / html is required. */
  text?: string;
  html?: string;
  replyTo?: string;
};

export type MailRecipientResult = { id: string; to: string; status: "sent" | "failed" };

export type MailResult = {
  /** True when every recipient was sent. False on a partial success (HTTP 207): inspect `results`. */
  ok: boolean;
  results: MailRecipientResult[];
};

export type TelemetryEvent = {
  event_type: string;
  level: Level;
  message: string;
  payload?: Record<string, unknown>;
};

export type TenantUser = {
  id: string;
  email: string;
  role: string;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

export type OtpRequestResult = { expiresInSeconds: number };

export type VerifyResult = { token: string; expiresAt: string; user: TenantUser };

export type MeResult = { user: TenantUser; session: { id: string; expiresAt: string } };

/* ---------------------------------------------------------------------------------------------- errors */

/**
 * Every non-2xx answer (and every network failure) is thrown as a HubError.
 *   400 validation      -> code "invalid_request", `fields` names the offending fields (never their values)
 *   401                 -> "unauthorized" (bad key/app id), "invalid_code" (OTP), "invalid_token" (end-user token)
 *   413                 -> "payload_too_large"
 *   429                 -> "rate_limited" | "quota_exceeded", `retryAfterSeconds` is set
 *   502 / 503 / network -> `isRetryable` is true
 */
export class HubError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: string[];
  readonly retryAfterSeconds?: number;
  /** The parsed JSON body, if any (e.g. per-recipient `results` on a 502 from mail.send). */
  readonly details?: unknown;

  constructor(init: { status: number; code: string; message: string; fields?: string[]; retryAfterSeconds?: number; details?: unknown }) {
    super(init.message);
    this.name = "HubError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.details = init.details;
  }

  /** Safe to retry later: rate limits, upstream/mail outages, timeouts and network failures. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

/* ---------------------------------------------------------------------------------------------- helpers */

const DEFAULT_BASE_URL = "https://nnamdiemmanueldike.vercel.app";
const MAX_MESSAGE = 2000;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_DEPTH = 6;
const MAX_NODES = 500;
const EVENT_TYPE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

type Env = {
  window?: {
    addEventListener(type: string, fn: (event: unknown) => void): void;
    removeEventListener(type: string, fn: (event: unknown) => void): void;
  };
  process?: { on(event: string, fn: (...args: unknown[]) => void): void; off(event: string, fn: (...args: unknown[]) => void): void };
};
const env = globalThis as unknown as Env;
const hasWindow = () => typeof env.window?.addEventListener === "function";

/** Coerces any string into a valid event type ("Checkout Failed!" -> "checkout_failed_"). */
function normalizeEventType(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._:-]/g, "_").replace(/^[^a-z0-9]+/, "").slice(0, 64);
  return EVENT_TYPE.test(cleaned) ? cleaned : "event";
}

/** Plain-data copy that satisfies the hub's payload limits (depth, node count, size) and never throws. */
function sanitizePayload(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined || input === null) return undefined;
  let nodes = 0;
  const seen = new WeakSet<object>();
  const walk = (value: unknown, depth: number): unknown => {
    if (++nodes > MAX_NODES) return "[truncated]";
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
    if (depth >= MAX_DEPTH) return "[truncated]";
    if (value instanceof Error) return walk({ name: value.name, message: value.message, stack: value.stack }, depth);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
      if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1) ?? null);
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        const copy = walk(item, depth + 1);
        if (copy !== undefined) out[key] = copy;
      }
      return out;
    }
    return undefined;
  };
  const root = input instanceof Error ? walk(input, 0) : typeof input === "object" && !Array.isArray(input) ? walk(input, 0) : { value: walk(input, 1) };
  const payload = (root && typeof root === "object" ? root : { value: root }) as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PAYLOAD_BYTES) {
    // Keep the most useful part of an error (the message and the head of the stack), drop the rest.
    const stack = typeof payload.stack === "string" ? payload.stack.slice(0, 3000) : undefined;
    return { _truncated: true, ...(typeof payload.message === "string" ? { message: payload.message.slice(0, 500) } : {}), ...(stack ? { stack } : {}) };
  }
  return payload;
}

/* ------------------------------------------------------------------------------------------------ client */

type RequestInit2 = { method: "GET" | "POST"; path: string; body?: unknown; token?: string; headers?: Record<string, string>; timeoutMs?: number; keepalive?: boolean };

export class HubClient {
  readonly config: { get(keys?: string[]): Promise<ConfigResult> };
  readonly mail: { send(message: MailMessage): Promise<MailResult> };
  readonly telemetry: {
    log(level: Level, eventType: string, message: string, payload?: unknown): void;
    /** Sends everything queued now. Resolves when the queue is empty or a retryable failure paused it. */
    flush(): Promise<void>;
    /** Sends events immediately and throws a HubError on failure. For relay routes that forward events. */
    ingest(events: TelemetryEvent | TelemetryEvent[]): Promise<{ accepted: number }>;
    /** Reports uncaught errors and unhandled promise rejections. Returns a function that removes the listeners. */
    attachGlobalErrorListener(options?: { level?: Level; eventType?: string }): () => void;
    /** Number of events waiting to be sent. */
    readonly pending: number;
  };
  readonly auth: {
    requestOtp(email: string): Promise<OtpRequestResult>;
    verifyOtp(email: string, code: string): Promise<VerifyResult>;
    me(token: string): Promise<MeResult>;
    logout(token: string): Promise<void>;
  };

  private readonly appId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly relayUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly configCache = new Map<string, { etag: string; result: ConfigResult }>();

  private readonly queue: TelemetryEvent[] = [];
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueue: number;
  private readonly onTelemetryError?: TelemetryOptions["onError"];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pausedUntil = 0;
  private flushing: Promise<void> | null = null;
  private pageHideBound = false;

  constructor(options: HubClientOptions | (BrowserClientOptions & { __browser: true })) {
    const browserMode = "__browser" in options;
    const server = browserMode ? null : (options as HubClientOptions);
    const browser = browserMode ? (options as BrowserClientOptions) : null;

    if (server) {
      if (!server.appId || !server.apiKey) throw new Error("HubClient needs { appId, apiKey }");
      if (hasWindow() && server.apiKey.startsWith("hub_live_")) {
        console.warn("[hub-sdk] A hub_live_ API key is being used in a browser. It is a secret: move this code to your server and use HubClient.forBrowser() with a relay route.");
      }
    } else if (!browser?.relayUrl) {
      throw new Error("HubClient.forBrowser needs { relayUrl }");
    }

    this.appId = server?.appId ?? "";
    this.apiKey = server?.apiKey ?? "";
    this.baseUrl = (server?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.relayUrl = browser?.relayUrl ?? null;
    const impl = (server ?? browser)?.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
    if (!impl) throw new Error("No fetch available. Pass { fetch } or use Node 18+.");
    this.fetchImpl = impl;
    this.timeoutMs = server?.timeoutMs ?? 10_000;

    const t = (server ?? browser)?.telemetry ?? {};
    this.batchSize = Math.min(Math.max(1, t.batchSize ?? 10), 10);
    this.flushIntervalMs = t.flushIntervalMs ?? 2000;
    this.maxQueue = Math.max(this.batchSize, t.maxQueue ?? 100);
    this.onTelemetryError = t.onError;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const keyed = (what: string) => {
      if (self.relayUrl) throw new Error(`${what} is not available on a browser client: call it from your server with HubClient({ appId, apiKey }).`);
    };

    this.config = {
      get: (keys) => {
        keyed("config.get");
        return self.getConfig(keys);
      },
    };
    this.mail = {
      send: (message) => {
        keyed("mail.send");
        return self.sendMail(message);
      },
    };
    this.auth = {
      requestOtp: async (email) => {
        keyed("auth.requestOtp");
        const body = await self.request<{ expiresInSeconds: number }>({ method: "POST", path: "/auth/otp/request", body: { email } });
        return { expiresInSeconds: body.expiresInSeconds };
      },
      verifyOtp: async (email, code) => {
        keyed("auth.verifyOtp");
        return self.request<VerifyResult>({ method: "POST", path: "/auth/otp/verify", body: { email, code } });
      },
      me: async (token) => {
        keyed("auth.me");
        return self.request<MeResult>({ method: "GET", path: "/auth/me", token });
      },
      logout: async (token) => {
        keyed("auth.logout");
        await self.request({ method: "POST", path: "/auth/logout", token });
      },
    };
    this.telemetry = {
      log: (level, eventType, message, payload) => self.enqueue(level, eventType, message, payload),
      flush: () => self.flush(),
      ingest: async (events) => {
        keyed("telemetry.ingest");
        const list = Array.isArray(events) ? events : [events];
        const body = await self.request<{ accepted: number }>({ method: "POST", path: "/telemetry", body: list.length === 1 ? list[0] : list });
        return { accepted: body.accepted };
      },
      attachGlobalErrorListener: (options) => self.attachListeners(options),
      get pending() {
        return self.queue.length;
      },
    };
  }

  /**
   * A key-less, telemetry-only client for browsers. Events are posted to YOUR same-origin relay route
   * (which forwards them to the hub with the server-side key). No secret ever reaches the page.
   */
  static forBrowser(options: BrowserClientOptions): HubClient {
    return new HubClient({ ...options, __browser: true } as unknown as HubClientOptions);
  }

  /* ------------------------------------------------------------------------------------------- transport */

  private async request<T>(init: RequestInit2): Promise<T> {
    const url = this.relayUrl ?? `${this.baseUrl}/api/hub/v1${init.path}`;
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (!this.relayUrl) {
      headers["x-app-id"] = this.appId;
      headers.Authorization = `Bearer ${this.apiKey}`;
      if (init.token) headers["x-user-token"] = init.token;
    }
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
        keepalive: init.keepalive,
        cache: "no-store",
      });
    } catch (cause) {
      const aborted = controller.signal.aborted;
      throw new HubError({ status: 0, code: aborted ? "timeout" : "network_error", message: aborted ? "The request timed out." : "Could not reach the hub." , details: cause instanceof Error ? cause.message : undefined });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 304) return undefined as T;
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const error = (json as { error?: { code?: string; message?: string; fields?: string[] } } | null)?.error;
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new HubError({
        status: response.status,
        code: error?.code ?? `http_${response.status}`,
        message: error?.message ?? `Hub request failed with status ${response.status}.`,
        fields: error?.fields,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        details: json,
      });
    }
    return json as T;
  }

  /* --------------------------------------------------------------------------------------------- config */

  private async getConfig(keys?: string[]): Promise<ConfigResult> {
    const wanted = keys && keys.length > 0 ? [...new Set(keys)].sort() : null;
    const cacheKey = wanted ? wanted.join(",") : "*";
    const cached = this.configCache.get(cacheKey);
    const query = wanted ? `?keys=${encodeURIComponent(wanted.join(","))}` : "";

    const url = `${this.baseUrl}/api/hub/v1/config${query}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { "x-app-id": this.appId, Authorization: `Bearer ${this.apiKey}`, ...(cached ? { "If-None-Match": cached.etag } : {}) },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (cause) {
      const aborted = controller.signal.aborted;
      throw new HubError({ status: 0, code: aborted ? "timeout" : "network_error", message: aborted ? "The request timed out." : "Could not reach the hub.", details: cause instanceof Error ? cause.message : undefined });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 304 && cached) return { ...cached.result, fromCache: true };
    if (!response.ok) {
      const text = await response.text();
      let json: { error?: { code?: string; message?: string } } | null = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new HubError({
        status: response.status,
        code: json?.error?.code ?? `http_${response.status}`,
        message: json?.error?.message ?? `Hub request failed with status ${response.status}.`,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        details: json,
      });
    }
    const body = (await response.json()) as Omit<ConfigResult, "fromCache">;
    const result: ConfigResult = { app: body.app, version: body.version, updatedAt: body.updatedAt, config: body.config, fromCache: false };
    const etag = response.headers.get("etag");
    if (etag) this.configCache.set(cacheKey, { etag, result });
    return result;
  }

  /* ----------------------------------------------------------------------------------------------- mail */

  private async sendMail(message: MailMessage): Promise<MailResult> {
    const body = await this.request<{ ok: boolean; results: MailRecipientResult[] }>({ method: "POST", path: "/mail/send", body: message, timeoutMs: Math.max(this.timeoutMs, 30_000) });
    return { ok: body.ok, results: body.results };
  }

  /* ------------------------------------------------------------------------------------------ telemetry */

  private enqueue(level: Level, eventType: string, message: string, payload?: unknown): void {
    try {
      const text = String(message ?? "").replace(/\0/g, "").slice(0, MAX_MESSAGE) || "(empty message)";
      const event: TelemetryEvent = { event_type: normalizeEventType(String(eventType ?? "")), level, message: text };
      const clean = sanitizePayload(payload);
      if (clean) event.payload = clean;

      this.queue.push(event);
      if (this.queue.length > this.maxQueue) {
        const dropped = this.queue.splice(0, this.queue.length - this.maxQueue).length;
        this.onTelemetryError?.(new Error("telemetry queue is full; oldest events were dropped"), dropped);
      }
      if (this.queue.length >= this.batchSize) void this.flush();
      else this.arm();
      this.bindPageHide();
    } catch {
      // logging must never break the host app
    }
  }

  private arm(): void {
    if (this.timer || this.flushIntervalMs <= 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
    (this.timer as unknown as { unref?: () => void }).unref?.(); // never keep a Node process alive
  }

  private bindPageHide(): void {
    if (this.pageHideBound || !hasWindow()) return;
    this.pageHideBound = true;
    env.window?.addEventListener("pagehide", () => void this.flush(true));
  }

  private flush(keepalive = false): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain(keepalive).finally(() => {
      this.flushing = null;
      if (this.queue.length > 0 && Date.now() >= this.pausedUntil) this.arm();
    });
    return this.flushing;
  }

  private async drain(keepalive: boolean): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      if (Date.now() < this.pausedUntil) return; // rate-limited: the timer retries later
      const batch = this.queue.splice(0, this.batchSize);
      try {
        await this.request({ method: "POST", path: "/telemetry", body: batch.length === 1 ? batch[0] : batch, keepalive });
      } catch (error) {
        const err = error instanceof HubError ? error : new HubError({ status: 0, code: "network_error", message: "Could not reach the hub." });
        if (err.isRetryable) {
          // put the batch back at the front (capped) and wait before trying again
          this.queue.unshift(...batch);
          if (this.queue.length > this.maxQueue) {
            const dropped = this.queue.splice(this.maxQueue).length;
            this.onTelemetryError?.(err, dropped);
          }
          this.pausedUntil = Date.now() + (err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : 5000);
          return;
        }
        if (err.status === 400 && batch.length > 1) {
          // one bad event rejects the whole batch (all-or-nothing): resend one by one so the good ones survive
          let dropped = 0;
          for (const event of batch) {
            try {
              await this.request({ method: "POST", path: "/telemetry", body: event, keepalive });
            } catch {
              dropped += 1;
            }
          }
          if (dropped > 0) this.onTelemetryError?.(err, dropped);
          continue;
        }
        this.onTelemetryError?.(err, batch.length); // 400 (single), 401, 413...: retrying cannot help
      }
    }
  }

  private attachListeners(options?: { level?: Level; eventType?: string }): () => void {
    const level = options?.level ?? "error";
    const eventType = options?.eventType;
    const disposers: Array<() => void> = [];

    if (hasWindow() && env.window) {
      const win = env.window;
      const onError = (event: unknown) => {
        const e = event as { message?: string; filename?: string; lineno?: number; colno?: number; error?: unknown };
        this.enqueue(level, eventType ?? "window.error", e.message || "Uncaught error", { source: e.filename, line: e.lineno, column: e.colno, error: e.error });
      };
      const onRejection = (event: unknown) => {
        const reason = (event as { reason?: unknown }).reason;
        this.enqueue(level, eventType ?? "window.unhandled_rejection", reason instanceof Error ? reason.message : String(reason), { reason });
      };
      win.addEventListener("error", onError);
      win.addEventListener("unhandledrejection", onRejection);
      disposers.push(() => win.removeEventListener("error", onError), () => win.removeEventListener("unhandledrejection", onRejection));
    } else if (env.process && typeof env.process.on === "function") {
      const proc = env.process;
      // Observing only: Node's default behaviour is NOT suppressed or changed.
      const onException = (error: unknown) => {
        this.enqueue("fatal", eventType ?? "process.uncaught_exception", error instanceof Error ? error.message : String(error), { error });
        void this.flush();
      };
      const onRejection = (reason: unknown) => {
        this.enqueue(level, eventType ?? "process.unhandled_rejection", reason instanceof Error ? reason.message : String(reason), { reason });
        void this.flush();
      };
      proc.on("uncaughtExceptionMonitor", onException);
      proc.on("unhandledRejection", onRejection);
      disposers.push(() => proc.off("uncaughtExceptionMonitor", onException), () => proc.off("unhandledRejection", onRejection));
    }
    return () => disposers.forEach((dispose) => dispose());
  }
}
