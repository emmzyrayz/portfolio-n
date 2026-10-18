import { withHub } from "@/lib/hub";
import { revokeSession } from "@/lib/hub-auth";
import { USER_TOKEN_HEADER, readUserToken } from "@/lib/hub-auth-schemas";

// Ends the session behind a token. Idempotent: logging out twice is still 200. A malformed, forged or
// other-tenant token gets the same 401 as /me.
export const POST = withHub(async ({ app }, request) => {
  const token = readUserToken(request.headers.get(USER_TOKEN_HEADER));
  if (!token || !(await revokeSession(app.id, token))) {
    return Response.json({ error: { code: "invalid_token", message: "The token is invalid or has expired." } }, { status: 401 });
  }
  return Response.json({ ok: true });
});
