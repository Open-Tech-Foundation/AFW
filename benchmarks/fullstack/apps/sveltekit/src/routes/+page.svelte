<script>
  import Counter from "../../components/Counter.svelte";

  let { data } = $props();
</script>

<section>
  <h1 class="text-3xl font-bold">Store</h1>
  <Counter />
  <ul id="featured" class="mt-4 list-disc pl-6">
    {#each data.featured as product (product.id)}
      <li><a href="/products/{product.id}">{product.name}</a></li>
    {/each}
  </ul>
</section>
