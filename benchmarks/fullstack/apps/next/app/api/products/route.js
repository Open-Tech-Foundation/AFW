import products from "../../../data/products.json";

export function GET() {
  return Response.json(products);
}
