<script setup>
import products from "~~/data/products.json";

const { data: featured } = await useAsyncData("featured", () => Promise.resolve(products.slice(0, 5)));
</script>

<template>
  <section>
    <h1 class="text-3xl font-bold">Store</h1>
    <Counter />
    <ul id="featured" class="mt-4 list-disc pl-6">
      <li v-for="product in featured" :key="product.id"><NuxtLink :to="`/products/${product.id}`">{{ product.name }}</NuxtLink></li>
    </ul>
  </section>
</template>
