import { error } from "@sveltejs/kit";
import products from "../../../../data/products.json";

export const load = ({ params }) => {
  const product = products.find((p) => p.id === Number(params.id));
  if (!product) error(404, "Not found");
  return { product };
};
