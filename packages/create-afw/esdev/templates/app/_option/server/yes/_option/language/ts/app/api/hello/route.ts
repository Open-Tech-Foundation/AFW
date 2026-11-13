// GET /api/hello?name=… — API routes run on Node, so any npm package works here.
export function GET(request: Request, { query, locals }: { query: Record<string, string>; locals: Record<string, unknown> }) {
  return Response.json({ message: `Hello, ${query.name ?? "world"}!`, requestId: locals.requestId });
}
