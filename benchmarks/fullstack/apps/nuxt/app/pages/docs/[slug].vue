<script setup>
const route = useRoute();
const { data: page } = await useAsyncData(route.path, () => queryCollection("docs").path(route.path).first());
if (!page.value) throw createError({ statusCode: 404, statusMessage: "Not found" });
</script>

<template>
  <ContentRenderer :value="page" />
</template>
