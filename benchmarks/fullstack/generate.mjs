// Write the benchmark's shared input into a working copy of one app, in that
// framework's file conventions: the product data, the 10 docs pages, and K generated
// route pages, each with its own interactive component (so the build grows with the app).
//
//   node benchmarks/fullstack/generate.mjs <framework> <appDir> <K>

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { docs, products } from "./spec.mjs";

const write = async (path, text) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
};

// Each framework: where things go, and its component dialect.
const FRAMEWORKS = {
  afw: {
    clean: ["app/pages", "app/docs", "components/gen"],
    data: "data/products.json",
    doc: (slug) => `app/docs/${slug}/page.mdx`,
    page: (i) => [`app/pages/p${i}/page.jsx`, `import Card from "../../../components/Card.jsx";
import Widget from "../../../components/gen/Widget${i}.jsx";

export const metadata = { title: "Page ${i}" };

export default function Page${i}() {
  return (
    <section>
      <h1 class="text-2xl font-bold">Page ${i}</h1>
      <Card title="Section ${i}">
        <p>Generated route ${i}, with its own interactive widget.</p>
      </Card>
      <Widget />
    </section>
  );
}
`],
    widget: (i) => [`components/gen/Widget${i}.jsx`, `export default function Widget${i}() {
  let open = $state(false);
  return (
    <div class="widget rounded border p-2">
      <button onclick={() => (open = !open)}>Toggle ${i}</button>
      {open ? <p>Details for widget ${i}</p> : null}
    </div>
  );
}
`],
  },
};

// The React dialect, shared by Next.js, TanStack Start, Astro and Bun.
const reactWidget = (i, { client = false } = {}) => `${client ? '"use client";\n' : ""}import { useState } from "react";

export default function Widget${i}() {
  const [open, setOpen] = useState(false);
  return (
    <div className="widget rounded border p-2">
      <button onClick={() => setOpen(!open)}>Toggle ${i}</button>
      {open ? <p>Details for widget ${i}</p> : null}
    </div>
  );
}
`;
const reactPage = (i, { card, widget }) => `import Card from "${card}";
import Widget from "${widget}";

export default function Page${i}() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Page ${i}</h1>
      <Card title="Section ${i}">
        <p>Generated route ${i}, with its own interactive widget.</p>
      </Card>
      <Widget />
    </section>
  );
}
`;

FRAMEWORKS.next = {
  clean: ["app/pages", "app/docs", "components/gen"],
  data: "data/products.json",
  doc: (slug) => `app/docs/${slug}/page.mdx`,
  page: (i) => [`app/pages/p${i}/page.jsx`, reactPage(i, { card: "../../../components/Card.jsx", widget: `../../../components/gen/Widget${i}.jsx` })],
  widget: (i) => [`components/gen/Widget${i}.jsx`, reactWidget(i, { client: true })],
};

FRAMEWORKS.tanstack = {
  clean: ["src/routes/pages", "src/routes/docs", "src/content", "components/gen"],
  data: "data/products.json",
  docFile: (slug, mdx) => [`src/content/docs/${slug}.mdx`, mdx],
  docRoute: (slug) => [`src/routes/docs/${slug}.jsx`, `import { createFileRoute } from "@tanstack/react-router";
import Doc from "../../content/docs/${slug}.mdx";

export const Route = createFileRoute("/docs/${slug}")({ component: () => <Doc /> });
`],
  page: (i) => [`src/routes/pages/p${i}.jsx`, `import { createFileRoute } from "@tanstack/react-router";
import Card from "../../../components/Card.jsx";
import Widget from "../../../components/gen/Widget${i}.jsx";

export const Route = createFileRoute("/pages/p${i}")({ component: Page${i} });

function Page${i}() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Page ${i}</h1>
      <Card title="Section ${i}">
        <p>Generated route ${i}, with its own interactive widget.</p>
      </Card>
      <Widget />
    </section>
  );
}
`],
  widget: (i) => [`components/gen/Widget${i}.jsx`, reactWidget(i)],
};

FRAMEWORKS.astro = {
  clean: ["src/pages/pages", "src/pages/docs", "components/gen"],
  data: "data/products.json",
  // An MDX page with the site layout, as Astro wraps MDX pages.
  docFile: (slug, mdx) => [`src/pages/docs/${slug}.mdx`, `---\nlayout: ../../layouts/Layout.astro\n---\n\n${mdx}`],
  page: (i) => [`src/pages/pages/p${i}.astro`, `---
import Layout from "../../layouts/Layout.astro";
import Card from "../../../components/Card.jsx";
import Widget from "../../../components/gen/Widget${i}.jsx";
---
<Layout>
  <section>
    <h1 class="text-2xl font-bold">Page ${i}</h1>
    <Card title="Section ${i}">
      <p>Generated route ${i}, with its own interactive widget.</p>
    </Card>
    <Widget client:load />
  </section>
</Layout>
`],
  widget: (i) => [`components/gen/Widget${i}.jsx`, reactWidget(i)],
};

// The Solid dialect, for SolidStart.
FRAMEWORKS.solidstart = {
  clean: ["src/routes/pages", "src/routes/docs", "components/gen"],
  data: "data/products.json",
  doc: (slug) => `src/routes/docs/${slug}.mdx`,
  page: (i) => [`src/routes/pages/p${i}.jsx`, `import Card from "../../../components/Card.jsx";
import Widget from "../../../components/gen/Widget${i}.jsx";

export default function Page${i}() {
  return (
    <section>
      <h1 class="text-2xl font-bold">Page ${i}</h1>
      <Card title="Section ${i}">
        <p>Generated route ${i}, with its own interactive widget.</p>
      </Card>
      <Widget />
    </section>
  );
}
`],
  widget: (i) => [`components/gen/Widget${i}.jsx`, `import { Show, createSignal } from "solid-js";

export default function Widget${i}() {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="widget rounded border p-2">
      <button onClick={() => setOpen(!open())}>Toggle ${i}</button>
      <Show when={open()}><p>Details for widget ${i}</p></Show>
    </div>
  );
}
`],
};

// The Svelte dialect, for SvelteKit; mdsvex renders the docs as .md routes.
FRAMEWORKS.sveltekit = {
  clean: ["src/routes/pages", "src/routes/docs", "components/gen"],
  data: "data/products.json",
  doc: (slug) => `src/routes/docs/${slug}/+page.md`,
  page: (i) => [`src/routes/pages/p${i}/+page.svelte`, `<script>
  import Card from "../../../../components/Card.svelte";
  import Widget from "../../../../components/gen/Widget${i}.svelte";
</script>

<section>
  <h1 class="text-2xl font-bold">Page ${i}</h1>
  <Card title="Section ${i}">
    <p>Generated route ${i}, with its own interactive widget.</p>
  </Card>
  <Widget />
</section>
`],
  widget: (i) => [`components/gen/Widget${i}.svelte`, `<script>
  let open = $state(false);
</script>

<div class="widget rounded border p-2">
  <button onclick={() => (open = !open)}>Toggle ${i}</button>
  {#if open}<p>Details for widget ${i}</p>{/if}
</div>
`],
};

// The Vue dialect, for Nuxt: auto-imported components (components/gen/Widget3.vue is
// <GenWidget3>), and the docs as Nuxt Content pages.
FRAMEWORKS.nuxt = {
  clean: ["app/pages/pages", "content", "app/components/gen"],
  data: "data/products.json",
  doc: (slug) => `content/docs/${slug}.md`,
  page: (i) => [`app/pages/pages/p${i}.vue`, `<template>
  <section>
    <h1 class="text-2xl font-bold">Page ${i}</h1>
    <Card title="Section ${i}">
      <p>Generated route ${i}, with its own interactive widget.</p>
    </Card>
    <GenWidget${i} />
  </section>
</template>
`],
  widget: (i) => [`app/components/gen/Widget${i}.vue`, `<script setup>
const open = ref(false);
</script>

<template>
  <div class="widget rounded border p-2">
    <button @click="open = !open">Toggle ${i}</button>
    <p v-if="open">Details for widget ${i}</p>
  </div>
</template>
`],
};

export async function generate(framework, appDir, k) {
  const f = FRAMEWORKS[framework];
  if (!f) throw new Error(`unknown framework ${framework}`);
  for (const path of f.clean) await rm(join(appDir, path), { recursive: true, force: true });
  await write(join(appDir, f.data), `${JSON.stringify(products(), null, 2)}\n`);
  for (const { slug, mdx } of docs()) {
    const [path, text] = f.docFile ? f.docFile(slug, mdx) : [f.doc(slug), mdx];
    await write(join(appDir, path), text);
    if (f.docRoute) await write(join(appDir, f.docRoute(slug)[0]), f.docRoute(slug)[1]);
  }
  for (let i = 1; i <= k; i++) {
    const [pagePath, page] = f.page(i);
    const [widgetPath, widget] = f.widget(i);
    await write(join(appDir, pagePath), page);
    await write(join(appDir, widgetPath), widget);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [framework, appDir, k] = process.argv.slice(2);
  await generate(framework, appDir, Number(k));
}
