import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: anything without a session cookie goes to /login.
// The real session check happens server-side in requireUser().
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("callin_session");
  const path = request.nextUrl.pathname;
  // Public event pages, and the files they show (that route checks access itself).
  const isPublic = path === "/login" || path === "/signup" || path.startsWith("/e/") || path.startsWith("/files/");
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
