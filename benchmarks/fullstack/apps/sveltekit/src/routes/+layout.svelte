<script>
  import CartBadge from "../../components/CartBadge.svelte";
  import "../app.css";

  let { children } = $props();
</script>

<div class="mx-auto max-w-4xl p-6">
  <nav class="mb-6 flex gap-4">
    <a href="/">Home</a>
    <a href="/docs/getting-started">Docs</a>
    <a href="/account">Account</a>
    <CartBadge />
  </nav>
  <main>{@render children()}</main>
</div>
