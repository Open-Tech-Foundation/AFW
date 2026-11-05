<script setup>
const cart = useCart();
</script>

<template>
  <span id="cart" class="ml-auto">Cart: {{ cart }}</span>
</template>
