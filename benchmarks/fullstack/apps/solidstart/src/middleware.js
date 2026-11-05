import { createMiddleware } from "@solidjs/start/middleware";

// Guards /account: no "user" cookie, back to the home page.
export default createMiddleware([
  (event) => {
    const { pathname } = new URL(event.req.url);
    if (pathname === "/account" && !/(?:^|;\s*)user=/.test(event.req.headers.get("cookie") ?? "")) {
      return new Response(null, { status: 302, headers: { location: "/" } });
    }
  },
]);
