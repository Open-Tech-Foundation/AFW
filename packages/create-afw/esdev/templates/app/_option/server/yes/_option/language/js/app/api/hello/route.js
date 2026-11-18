// GET /api/hello?name=… — API routes run on esrun: web APIs, `runtime:` modules and npm packages that need no `node:` built-ins.
export function GET(request, { query, locals }) {
  return Response.json({ message: `Hello, ${query.name ?? "world"}!`, requestId: locals.requestId });
}
