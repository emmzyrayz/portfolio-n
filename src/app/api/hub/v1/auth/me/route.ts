import { withHub } from "@/lib/hub";
import { resolveSession } from "@/lib/hub-auth";
import { USER_TOKEN_HEADER, readUserToken } from "@/lib/hub-auth-schemas";

// Who does this end-user token belong to? Always checked against the database (no caching), so a logout or
// an owner revocation applies on the very next call. One generic 401 for every kind of failure.
const invalidToken = () => Response.json({ error: { code: "invalid_token", message: "The token is invalid or has expired." } }, { status: 401 });

export const GET = withHub(async ({ app }, request) => {
  const token = readUserToken(request.headers.get(USER_TOKEN_HEADER));
  if (!token) return invalidToken();

  const resolved = await resolveSession(app.id, token);
  if (!resolved) return invalidToken();

  const { user, session } = resolved;
  return Response.json({
    user: { id: user.id, email: user.email, role: user.role, metadata: user.metadata, createdAt: user.createdAt.toISOString() },
    session: { id: session.id, expiresAt: session.expiresAt.toISOString() },
  });
});
