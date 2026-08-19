import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "ziru_session";

const PROTECTED_PATHS = [
  "/",
  "/users",
  "/api-keys",
  "/attributes",
  "/documents",
  "/jobs",
  "/webhooks",
  "/settings",
];

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL(
      `/login?callback=${encodeURIComponent(pathname + search)}`,
      request.url
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
