import { notFound } from "@opentf/afw/server";
import products from "../../../data/products.json";

export default function loader({ params }) {
  const product = products.find((p) => p.id === Number(params.id));
  if (!product) notFound();
  return product;
}
