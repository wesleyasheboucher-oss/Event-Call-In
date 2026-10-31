import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: anything without a session cookie goes to /login.
// The real session check happens server-side in requireUser().
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("callin_session");
  const isPublic = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup";
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
