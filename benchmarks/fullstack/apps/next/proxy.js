import { NextResponse } from "next/server";

// Guards /account: no "user" cookie, back to the home page.
export function proxy(request) {
  if (!request.cookies.has("user")) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: "/account" };
