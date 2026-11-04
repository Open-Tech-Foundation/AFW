import { notFound } from "next/navigation";
import AddToCart from "../../../components/AddToCart.jsx";
import products from "../../../data/products.json";

export default async function Product({ params }) {
  const { id } = await params;
  const product = products.find((p) => p.id === Number(id));
  if (!product) notFound();
  return (
    <article>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-lg">${product.price}</p>
      <p>{product.description}</p>
      <AddToCart id={product.id} />
    </article>
  );
}
