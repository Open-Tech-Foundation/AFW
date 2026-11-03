// Node-only APIs: proves server routes run on Node, not ES-Runtime.
import { platform } from "node:os";
import { createHash } from "node:crypto";

export function GET(request, { locals, query }) {
  const digest = createHash("sha256").update(query.name ?? "world").digest("hex").slice(0, 8);
  return Response.json({ hello: query.name ?? "world", digest, platform: platform(), via: locals.via });
}

export async function POST(request) {
  const body = await request.json();
  return Response.json({ received: body }, { status: 201 });
}
