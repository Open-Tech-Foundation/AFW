import { createFileRoute, notFound } from "@tanstack/react-router";
import AddToCart from "../../../components/AddToCart.jsx";
import products from "../../../data/products.json";

export const Route = createFileRoute("/products/$id")({
  loader: ({ params }) => {
    const product = products.find((p) => p.id === Number(params.id));
    if (!product) throw notFound();
    return product;
  },
  component: Product,
});

function Product() {
  const product = Route.useLoaderData();
  return (
    <article>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-lg">${product.price}</p>
      <p>{product.description}</p>
      <AddToCart id={product.id} />
    </article>
  );
}
