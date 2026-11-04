// Guards /account: no "user" cookie, back to the home page.
export default async function middleware(request, context, next) {
  if (!/(?:^|;\s*)user=/.test(request.headers.get("cookie") ?? "")) {
    return new Response(null, { status: 302, headers: { location: "/" } });
  }
  return next();
}
