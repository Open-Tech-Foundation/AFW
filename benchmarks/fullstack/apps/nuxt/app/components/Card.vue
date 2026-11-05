<script setup>
defineProps({ title: String });
</script>

<template>
  <div class="my-4 rounded-lg border p-4">
    <h2 class="font-semibold">{{ title }}</h2>
    <slot />
  </div>
</template>
