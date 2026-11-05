<script>
  import { cart } from "./cart.svelte.js";

  let { id } = $props();

  async function add() {
    const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    cart.count = (await response.json()).count;
  }
</script>

<button id="add" class="mt-4 rounded bg-emerald-600 px-3 py-1 text-white" onclick={add}>Add to cart</button>
