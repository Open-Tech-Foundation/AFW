import { Link, router } from "@opentf/afw";
import Counter from "../components/Counter.jsx";

export const metadata = { title: "Store" };

export default function Home() {
  return (
    <section>
      <h1 class="text-3xl font-bold">Store</h1>
      <Counter />
      <ul id="featured" class="mt-4 list-disc pl-6">
        {(router.data?.featured ?? []).map((product) => (
          <li><Link href={`/products/${product.id}`}>{product.name}</Link></li>
        ))}
      </ul>
    </section>
  );
}
