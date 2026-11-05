<script setup>
const count = ref(0);
</script>

<template>
  <button id="counter" class="rounded bg-sky-600 px-3 py-1 text-white" @click="count++">
    Count: {{ count }}
  </button>
</template>
