// Content for the landing page (app/page.jsx). Kept as data so the page stays a
// thin, declarative component and the capabilities/benchmark stay easy to keep
// truthful — every status here is checked against the actual codebase.

import benchmarkReport from "./benchmark-report.json";
import ssgBenchmarkReport from "./ssg-benchmark.json";

// --- Runtime benchmark (generated) -------------------------------------------
// `tsr bench -- all` writes app/benchmark-report.json — medians, per-row winner,
// and the timing-resolution tie rule all come from the runner (see
// benchmarks/README.md for the methodology and its limits) — and the homepage
// renders that report as-is, so the table can't drift from the last recorded run.
export const benchmark = benchmarkReport;

// --- SSG build benchmark -----------------------------------------------------
// Build cost, not runtime: peak memory and wall time to build the same 72 KB MDX
// docs page. Recorded by hand from benchmarks/ssg-build (five separate toolchains,
// so there is no single runner to generate it) — methodology, the full 70 KB→2.2 MB
// ladder, and the caveats that belong with any of these numbers are in
// benchmarks/ssg-build/README.md.
export const ssgBenchmark = ssgBenchmarkReport;

// --- Capabilities & roadmap (grouped; statuses verified against the codebase) -
//     status: "supported" | "partial" | "beta" | "planned"
export const capabilities = [
  {
    category: "Core",
    items: [
      { name: "Client Rendering (CSR)", status: "supported", desc: "Compiler-driven SPA engine." },
      { name: "Zero-VDOM updates", status: "supported", desc: "Direct DOM bindings without a virtual DOM tree." },
      { name: "Reactive macros", status: "supported", desc: "$state, $derived, $effect, $context on fine-grained signals." },
      { name: "Refs & expose", status: "supported", desc: "$ref to elements; imperative $expose." },
      { name: "Context API", status: "supported", desc: "Scoped DI with createContext, ContextProvider, and $context — no prop drilling." },
      { name: "Portal", status: "supported", desc: "Render a subtree into another DOM target; context resolves across the boundary." },
    ],
  },
  {
    category: "Routing",
    items: [
      { name: "File-based router", status: "supported", desc: "Directory routing with client-side navigation." },
      { name: "Nested layouts", status: "supported", desc: "Shared layouts composed around matching routes." },
      { name: "Route guards", status: "supported", desc: "Client navigation checks and redirects; server auth uses middleware." },
      { name: "Code splitting", status: "supported", desc: "Dynamic route imports bundled and split by esdev." },
      { name: "Link prefetching", status: "supported", desc: "<Link> warms a route's chunks and loader data on hover, focus or in view." },
    ],
  },
  {
    category: "Rendering",
    items: [
      { name: "Static generation (SSG)", status: "supported", desc: "Pre-render routes to HTML at build time." },
      { name: "MDX", status: "supported", desc: "MDX pages and components; docs theme included." },
      { name: "Server rendering (SSR)", status: "supported", desc: "String renderers for an app-owned request server; shares the SSG render path." },
      { name: "Hydration", status: "supported", desc: "First paint adopts the server DOM — pages, layouts, lists, conditionals, and islands with rich props." },
    ],
  },
  {
    category: "Tooling & DX",
    items: [
      { name: "Two toolchains", status: "supported", desc: "esdev + ES-Runtime, or Vite + Node — the same app/ folder builds with either." },
      { name: "Project scaffolding", status: "supported", desc: "npm create @opentf/afw or esdev create: app, docs or library; any rendering; CSS or Tailwind." },
      { name: "Dev server + reload on save", status: "supported", desc: "esdev watches and rebuilds configured targets, refreshing accepted modules or reloading the page." },
      { name: "CSS hot updates", status: "supported", desc: "Global stylesheet edits update in place and keep page state." },
      { name: "JavaScript module HMR", status: "supported", desc: "esdev hot-swaps JavaScript modules that explicitly accept updates." },
      { name: "Component HMR", status: "supported", desc: "Component, page and layout edits refresh in place and keep their state; a compile error keeps the last view." },
      { name: "Compiler diagnostics", status: "supported", desc: "Located compile errors and source maps; runtime errors report through the framework API." },
      { name: "Testing library", status: "supported", desc: "Component testing utilities." },
      { name: "TypeScript / TSX", status: "beta", desc: "Compile TSX components with macro typings; full editor tooling is in progress." },
      { name: "Devtools extension", status: "planned", desc: "Component, state, and network inspection." },
    ],
  },
  {
    category: "Styling",
    items: [
      { name: "Tailwind CSS", status: "supported", desc: "Tailwind 4 in both toolchains: esdev compiles it natively, Vite through @tailwindcss/vite." },
      { name: "Scoped CSS Modules", status: "supported", desc: "Component-scoped class names." },
    ],
  },
  {
    category: "Full-stack",
    items: [
      { name: "Middleware", status: "supported", desc: "Server middleware for pages, APIs and loader data when included in the request pipeline." },
      { name: "Cookie helpers", status: "supported", desc: "getCookie / setCookie / deleteCookie on @opentf/afw/server — RFC 6265 helpers for middleware, API routes, and loaders." },
      { name: "Reactive forms", status: "beta", desc: "@opentf/afw-form — nested reactive values, validation and submit state." },
      { name: "API routes", status: "supported", desc: "File-based route.js / route.ts endpoints — standard Request/Response and dynamic params." },
      { name: "Server functions", status: "supported", desc: "Typed query() / action() in .server.js files, validated, under folder middleware; invalidate() refetches." },
      { name: "Data fetching", status: "supported", desc: "Route loaders (loader.js → router.data across SSR/SSG/SPA) and the client-side resource()." },
      { name: "Progressive forms", status: "planned", desc: "<form action={addTodo}> that works without JavaScript under SSR." },
      { name: "Internationalization", status: "beta", desc: "@opentf/afw-i18n — URL-prefix locale routing, ICU messages, and Intl formatters (Phase 1)." },
      { name: "Accessibility helpers", status: "planned", desc: "ARIA helpers and a11y defaults." },
    ],
  },
];

// --- Hero code showcase ------------------------------------------------------
export const codeSamples = [
  {
    label: "Component",
    file: "app/Counter.jsx",
    code: `export default function Counter({ start = 0 }) {
  let count = $state(start);
  const doubled = $derived(count * 2);

  return (
    <button onclick={() => count++}>
      {count} × 2 = {doubled}
    </button>
  );
}`,
  },
  {
    label: "Server function",
    file: "app/todos/todos.server.js",
    code: `import { action, query } from "@opentf/afw/server";
import { z } from "zod";

export const listTodos = query(async (_, { locals }) =>
  db.todos.list({ owner: locals.user.id }));

export const addTodo = action(
  z.object({ title: z.string().min(1) }),
  async ({ title }, { locals }) =>
    db.todos.insert({ owner: locals.user.id, title }),
);`,
  },
  {
    label: "Page",
    file: "app/todos/page.jsx",
    code: `import { invalidate, resource } from "@opentf/afw";
import { addTodo, listTodos } from "./todos.server.js";

export default function Todos() {
  const todos = resource(() => listTodos());

  async function add(title) {
    await addTodo({ title }); // a typed call, no fetch, no URL
    await invalidate(listTodos);
  }

  return <ul>{(todos.data ?? []).map((t) => <li>{t.title}</li>)}</ul>;
}`,
  },
];

// --- Why AFW -----------------------------------------------------------------
export const reasons = [
  { title: "Web Components, compiled", desc: "Every component is a real Custom Element, built from JSX at compile time. Usable in any page, with or without a framework.", icon: "box" },
  { title: "No virtual DOM", desc: "Signals bind each update to the DOM node it affects. No diffing, no re-rendering of whole components.", icon: "bolt" },
  { title: "Typed server functions", desc: "Call server code like a function: validated input, folder middleware, cross-site calls refused, invalidate() to refetch.", icon: "server" },
  { title: "Your toolchain", desc: "esdev with the capability-secured ES-Runtime, or Vite with Node and the whole npm ecosystem. Same app either way.", icon: "split" },
];

// --- Two workflows -----------------------------------------------------------
export const workflows = [
  {
    name: "esdev + ES-Runtime",
    tagline: "One binary: dev server, bundler, test runner and a capability-secured server runtime.",
    points: ["No node_modules toolchain to assemble", "File, network and process access only as declared", "Browser tests, coverage and benchmarks built in"],
    command: "esdev create my-app",
    href: "/docs/getting-started/installation",
  },
  {
    name: "Vite + Node",
    tagline: "The tools your team already runs, with server code on Node.",
    points: ["Any npm package on the server, native addons included", "Vitest for component and page tests", "Deploy dist/server to any Node host"],
    command: "npm create @opentf/afw@latest",
    href: "/docs/getting-started/installation#vite-and-node",
  },
];
