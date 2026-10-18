import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { UNAUTHORIZED_BODY, parseHubHeaders } from "@/lib/hub-shape";

// Optimistic checks only, no database (Next's guidance for proxy):
//  - /dashboard/*: cookie presence, so logged-out visitors get a real 307. The authoritative check is
//    verifySession() in src/lib/dal.ts.
//  - /api/hub/v1/*: header shape only (x-app-id + Bearer hub_live_...), so malformed calls get a fast 401.
//    The authoritative check (key hash, tenant match, status, rate limit) is withHub() in src/lib/hub.ts.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/hub/v1")) {
    if (!parseHubHeaders(request.headers)) {
      return NextResponse.json(UNAUTHORIZED_BODY, {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/hub/v1/:path*"],
};
