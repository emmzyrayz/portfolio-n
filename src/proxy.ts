import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic check only (cookie presence) so logged-out visitors get a real 307.
// The authoritative check is verifySession() in src/lib/dal.ts.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/dashboard/:path*",
};
