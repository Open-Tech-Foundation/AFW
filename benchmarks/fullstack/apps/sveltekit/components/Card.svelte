<script>
  let { title, children } = $props();
</script>

<div class="my-4 rounded-lg border p-4">
  <h2 class="font-semibold">{title}</h2>
  {@render children()}
</div>
