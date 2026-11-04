import products from "../data/products.json";

export default function loader() {
  return { featured: products.slice(0, 5) };
}
