import { A, createAsync, query } from "@solidjs/router";
import { For } from "solid-js";
import Counter from "../../components/Counter.jsx";
import products from "../../data/products.json";

const getFeatured = query(async () => {
  "use server";
  return products.slice(0, 5);
}, "featured");

export const route = { preload: () => getFeatured() };

export default function Home() {
  const featured = createAsync(() => getFeatured());
  return (
    <section>
      <h1 class="text-3xl font-bold">Store</h1>
      <Counter />
      <ul id="featured" class="mt-4 list-disc pl-6">
        <For each={featured()}>{(product) => <li><A href={`/products/${product.id}`}>{product.name}</A></li>}</For>
      </ul>
    </section>
  );
}
