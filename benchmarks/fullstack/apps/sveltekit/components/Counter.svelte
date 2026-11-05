<script>
  let count = $state(0);
</script>

<button id="counter" class="rounded bg-sky-600 px-3 py-1 text-white" onclick={() => count++}>
  Count: {count}
</button>
