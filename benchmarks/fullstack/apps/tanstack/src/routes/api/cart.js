import { createFileRoute } from "@tanstack/react-router";

let count = 0;

export const Route = createFileRoute("/api/cart")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "id required" }, { status: 400 });
        count++;
        return Response.json({ count });
      },
    },
  },
});
