export default async function middleware(request, context, next) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/admin") && request.headers.get("x-role") !== "admin") {
    return new Response(null, { status: 302, headers: { location: "/" } });
  }
  context.locals.via = "middleware";
  const response = await next();
  if (url.pathname.startsWith("/api/")) response.headers.set("x-afw-middleware", "yes");
  return response;
}
