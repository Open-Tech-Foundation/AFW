<template>
  <div class="mx-auto max-w-4xl p-6">
    <nav class="mb-6 flex gap-4">
      <NuxtLink to="/">Home</NuxtLink>
      <NuxtLink to="/docs/getting-started">Docs</NuxtLink>
      <NuxtLink to="/account">Account</NuxtLink>
      <CartBadge />
    </nav>
    <main><NuxtPage /></main>
  </div>
</template>
