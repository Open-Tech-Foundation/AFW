import { HttpStatusCode } from "@solidjs/start";
import { createAsync, query, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import AddToCart from "../../../components/AddToCart.jsx";
import products from "../../../data/products.json";

const getProduct = query(async (id) => {
  "use server";
  return products.find((p) => p.id === Number(id)) ?? null;
}, "product");

export const route = { preload: ({ params }) => getProduct(params.id) };

export default function Product() {
  const params = useParams();
  const product = createAsync(() => getProduct(params.id));
  return (
    <Show when={product()} fallback={<Show when={product() === null}><HttpStatusCode code={404} /><h1>Not found</h1></Show>}>
      {(p) => (
        <article>
          <h1 class="text-2xl font-bold">{p().name}</h1>
          <p class="text-lg">${p().price}</p>
          <p>{p().description}</p>
          <AddToCart id={p().id} />
        </article>
      )}
    </Show>
  );
}
