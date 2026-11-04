import { createFileRoute } from "@tanstack/react-router";
import products from "../../../data/products.json";

export const Route = createFileRoute("/api/products")({
  server: { handlers: { GET: () => Response.json(products) } },
});
