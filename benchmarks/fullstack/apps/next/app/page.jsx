import Link from "next/link";
import Counter from "../components/Counter.jsx";
import products from "../data/products.json";

export default function Home() {
  return (
    <section>
      <h1 className="text-3xl font-bold">Store</h1>
      <Counter />
      <ul id="featured" className="mt-4 list-disc pl-6">
        {products.slice(0, 5).map((product) => (
          <li key={product.id}><Link href={`/products/${product.id}`}>{product.name}</Link></li>
        ))}
      </ul>
    </section>
  );
}
