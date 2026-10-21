import { NextResponse, type NextRequest } from "next/server";

/*
 * Optimistic check only: redirect visitors without a session cookie to the
 * login page. It does not validate the session; the (dashboard) layout and the
 * data access layer (src/lib/auth/session.ts) do that on the server.
 */
const SESSION_COOKIES = ["__Host-sms_session", "sms_session"];
const PUBLIC_PATHS = ["/login", "/student-login", "/forgot-password", "/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/" && pathname !== "/dashboard") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except API routes, Next.js internals and static files.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
