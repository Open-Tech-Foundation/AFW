import { Link, createFileRoute } from "@tanstack/react-router";
import Counter from "../../components/Counter.jsx";
import products from "../../data/products.json";

export const Route = createFileRoute("/")({
  loader: () => ({ featured: products.slice(0, 5) }),
  component: Home,
});

function Home() {
  const { featured } = Route.useLoaderData();
  return (
    <section>
      <h1 className="text-3xl font-bold">Store</h1>
      <Counter />
      <ul id="featured" className="mt-4 list-disc pl-6">
        {featured.map((product) => (
          <li key={product.id}><Link to="/products/$id" params={{ id: String(product.id) }}>{product.name}</Link></li>
        ))}
      </ul>
    </section>
  );
}
