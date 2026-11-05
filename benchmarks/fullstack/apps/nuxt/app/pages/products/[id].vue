<script setup>
import products from "~~/data/products.json";

const route = useRoute();
const { data: product } = await useAsyncData(`product-${route.params.id}`, () => Promise.resolve(products.find((p) => p.id === Number(route.params.id)) ?? null));
if (!product.value) throw createError({ statusCode: 404, statusMessage: "Not found" });
</script>

<template>
  <article>
    <h1 class="text-2xl font-bold">{{ product.name }}</h1>
    <p class="text-lg">${{ product.price }}</p>
    <p>{{ product.description }}</p>
    <AddToCart :id="product.id" />
  </article>
</template>
