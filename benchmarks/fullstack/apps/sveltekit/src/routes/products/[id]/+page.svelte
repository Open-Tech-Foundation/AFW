<script>
  import AddToCart from "../../../../components/AddToCart.svelte";

  let { data } = $props();
</script>

<article>
  <h1 class="text-2xl font-bold">{data.product.name}</h1>
  <p class="text-lg">${data.product.price}</p>
  <p>{data.product.description}</p>
  <AddToCart id={data.product.id} />
</article>
