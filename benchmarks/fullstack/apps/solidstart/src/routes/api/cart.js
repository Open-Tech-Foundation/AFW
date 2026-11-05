let count = 0;

export async function POST({ request }) {
  const { id } = await request.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  count++;
  return Response.json({ count });
}
