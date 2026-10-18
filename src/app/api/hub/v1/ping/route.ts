import { withHub } from "@/lib/hub";

// Health check for hub clients: proves the key, tenant and rate limit are all valid.
export const GET = withHub(({ app, key, rate }) =>
  Response.json({
    ok: true,
    app: { slug: app.slug, name: app.name },
    key: { name: key.name, prefix: key.prefix },
    rateLimit: { limitPerMinute: rate.limit, remaining: rate.remaining },
  }),
);
