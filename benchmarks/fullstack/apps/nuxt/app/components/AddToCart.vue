<script setup>
const props = defineProps({ id: Number });
const cart = useCart();

async function add() {
  cart.value = (await $fetch("/api/cart", { method: "POST", body: { id: props.id } })).count;
}
</script>

<template>
  <button id="add" class="mt-4 rounded bg-emerald-600 px-3 py-1 text-white" @click="add">Add to cart</button>
</template>
