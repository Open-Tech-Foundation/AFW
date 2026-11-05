import { setCartCount } from "./cart.js";

export default function AddToCart(props) {
  async function add() {
    const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: props.id }) });
    setCartCount((await response.json()).count);
  }
  return <button id="add" class="mt-4 rounded bg-emerald-600 px-3 py-1 text-white" onClick={add}>Add to cart</button>;
}
