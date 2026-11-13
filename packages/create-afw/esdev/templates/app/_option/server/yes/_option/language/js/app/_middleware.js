// Runs for every request: pages, API routes, loader data and server functions alike.
// Authenticate here (set `context.locals.user`); each server function checks what
// that user may read or change.
export default async function middleware(request, context, next) {
  context.locals.requestId = crypto.randomUUID();
  const response = await next();
  response.headers.set("x-request-id", String(context.locals.requestId));
  return response;
}
