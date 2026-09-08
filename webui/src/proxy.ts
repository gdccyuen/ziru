import { NextResponse, type NextRequest } from "next/server";

export const ZIRU_SESSION_COOKIE = "ziru_session";

/**
 * Edge proxy: cheap short-circuit for anonymous requests to protected
 * routes. The real session check happens in the core API on every call;
 * here we only redirect when there is no session cookie at all.
 */

const PUBLIC_PATHS: readonly string[] = [
  "/login",
  "/force-change-password",
  "/favicon.ico",
  // Bootstrap-5 unified-UI design preview (no auth needed).
  "/ui-preview.html",
];

const STATIC_EXTENSIONS =
  /\.(?:svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|css|js|map|txt|xml|webmanifest|json|pdf|html)$/i;

function isPublicPath(req: NextRequest): boolean {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/_next")) return true;
  // API paths are proxied to the core API, which enforces auth itself.
  if (pathname.startsWith("/api/")) return true;
  if (STATIC_EXTENSIONS.test(pathname)) return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function proxy(req: NextRequest): NextResponse {
  if (isPublicPath(req)) return NextResponse.next();

  if (req.cookies.get(ZIRU_SESSION_COOKIE)) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|login|force-change-password|favicon.ico).*)"],
};
