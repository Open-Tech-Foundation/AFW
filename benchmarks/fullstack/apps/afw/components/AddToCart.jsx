import { cart } from "./cart.js";

export default function AddToCart({ id }) {
  async function add() {
    const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    cart.count = (await response.json()).count;
  }
  return <button id="add" class="mt-4 rounded bg-emerald-600 px-3 py-1 text-white" onclick={add}>Add to cart</button>;
}
