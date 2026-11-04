import { createMiddleware, createStart } from "@tanstack/react-start";

// Guards /account: no "user" cookie, back to the home page.
const guard = createMiddleware().server(({ request, next }) => {
  const { pathname } = new URL(request.url);
  if (pathname === "/account" && !/(?:^|;\s*)user=/.test(request.headers.get("cookie") ?? "")) {
    return new Response(null, { status: 302, headers: { location: "/" } });
  }
  return next();
});

export const startInstance = createStart(() => ({ requestMiddleware: [guard] }));
