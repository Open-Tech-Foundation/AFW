// The AFW project templates, for both workflows: Vite + Node (`npm create @opentf/afw`)
// and esdev + ES-Runtime (`esdev create`, from the starters generated into esdev/ by
// scripts/write-esdev-templates.mjs). Each is generated from one source for both
// toolchains, both languages and both stylings, so the variants never drift apart: the
// same questions, the same `app/` and `tests/`; only the toolchain's own files differ
// (`vite.config.js` or `esdev.json`, `server.js`/`ssg.js`, scripts, dependencies).
//
// Choices are independent where the framework allows it:
//   app      — default rendering (server / static / client / mixed, set in
//              app/_config.js) × server (API routes, middleware, loaders, server
//              functions) × styling (css / tailwind). Server and mixed always have one.
//   docs     — an afw-docs site: MDX docs, prerendered, with search; a blog with feeds
//              only when asked for.
//   library  — a package of components published as JSX source, with a dev preview.

import { readFileSync } from "node:fs";

import { escapeHTML } from "@opentf/std";

export const TEMPLATES = {
  app: "An app: choose how pages render and whether it has a server",
  docs: "A documentation site with search, and optionally a blog (afw-docs)",
  library: "A component library published as JSX source",
};

/** How an app's pages render by default (`app/_config.js`); any folder can override it. */
export const RENDERINGS = {
  client: "Rendered in the browser: apps behind a login",
  server: "Rendered per request: content sites, search, anything with SEO",
  static: "Built once at build time: marketing sites, docs, blogs",
  mixed: "Server by default, plus a static page and a client section to copy",
};

/** Renderings that always have a server. */
export const SERVER_RENDERINGS = new Set(["server", "mixed"]);

export const TOOLCHAINS = { vite: "Vite + Node", esdev: "esdev + ES-Runtime" };

export const STYLINGS = { css: "CSS", tailwind: "Tailwind CSS" };


// The third-party tools a new project starts on. AFW's own packages take the
// versions this scaffolder was released with (versions.js).
export const TOOL_VERSIONS = {
  vite: "^8.3.5",
  vitest: "^5.0.5",
  "happy-dom": "^21.0.4",
  typescript: "^6.0.3",
  tailwindcss: "^4.3.3",
  "@tailwindcss/vite": "^4.3.3",
};

/**
 * The files of a new project, as `{ relativePath: contents }`.
 *
 * `toolchain` picks the workflow's own files (`vite`, the default, or `esdev`); `pm` is the
 * package manager the README names. `versions` maps each package (AFW's, and any tool
 * in it) to the version to write; a tool it leaves out takes `TOOL_VERSIONS`.
 *
 * @param {{ name: string, template: keyof TEMPLATES, render?: string, server?: boolean,
 *           styling?: keyof STYLINGS, typescript: boolean, versions: Record<string, string>,
 *           toolchain?: keyof TOOLCHAINS, pm?: string, blog?: boolean }} options
 */
export function projectFiles({
  name, template, render = "client", server = false, blog = false, styling = "css", typescript, versions,
  toolchain = "vite", pm = "npm",
}) {
  if (!TEMPLATES[template]) throw new Error(`Unknown template "${template}". Choose one of: ${Object.keys(TEMPLATES).join(", ")}`);
  if (!RENDERINGS[render]) throw new Error(`Unknown rendering "${render}". Choose one of: ${Object.keys(RENDERINGS).join(", ")}`);
  if (!STYLINGS[styling]) throw new Error(`Unknown styling "${styling}". Choose one of: ${Object.keys(STYLINGS).join(", ")}`);
  if (!TOOLCHAINS[toolchain]) throw new Error(`Unknown toolchain "${toolchain}". Choose one of: ${Object.keys(TOOLCHAINS).join(", ")}`);
  const ctx = {
    name, versions, ts: typescript, js: typescript ? "ts" : "js", jsx: typescript ? "tsx" : "jsx",
    tailwind: styling === "tailwind", toolchain, esdev: toolchain === "esdev", pm,
  };
  if (template === "docs") return docsFiles({ ...ctx, blog });
  if (template === "library") return libraryFiles(ctx);
  return appFiles({ ...ctx, render, server: SERVER_RENDERINGS.has(render) || server });
}

// ---------------------------------------------------------------------------- shared

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const escapeJs = (text) => String(text).replace(/[\\"]/g, "\\$&");
// ` class="…"` with Tailwind, nothing with plain CSS.
const tw = (ctx, classes) => (ctx.tailwind ? ` class="${classes}"` : "");

/** The version to write for `pkg`: from `versions`, else the tool's default range. */
const version = (ctx, pkg) => ctx.versions[pkg] ?? TOOL_VERSIONS[pkg];

function devDependencies(ctx, extra = {}) {
  const v = (pkg) => version(ctx, pkg);
  if (ctx.esdev) {
    return sortKeys({
      "@opentf/afw-test": v("@opentf/afw-test"),
      "@opentf/esdev-plugin-afw": v("@opentf/esdev-plugin-afw"),
      "@opentf/esrun-types": v("@opentf/esrun-types"),
      ...(ctx.ts ? { typescript: v("typescript") } : {}),
      ...(ctx.tailwind ? { tailwindcss: v("tailwindcss") } : {}),
      ...extra,
    });
  }
  return sortKeys({
    "@opentf/afw-test": v("@opentf/afw-test"),
    "@opentf/vite-plugin-afw": v("@opentf/vite-plugin-afw"),
    "happy-dom": v("happy-dom"),
    ...(ctx.ts ? { typescript: v("typescript") } : {}),
    ...(ctx.tailwind ? { tailwindcss: v("tailwindcss"), "@tailwindcss/vite": v("@tailwindcss/vite") } : {}),
    vite: v("vite"),
    vitest: v("vitest"),
    ...extra,
  });
}

// esdev's own files: read from toolchain/esdev/ when an esdev project is generated.
const esdevFile = (name) => readFileSync(new URL(`./toolchain/esdev/${name}`, import.meta.url), "utf8");

/** esdev.json for a project: the AFW plugin (+ `plugins`), the web target and `targets`. */
function esdevConfig(ctx, { plugins = [], targets = {}, dev = null, afw = { appDir: "app" } } = {}) {
  return json({
    plugins: [{ module: "@opentf/esdev-plugin-afw", options: afw }, ...plugins],
    build: { targets: { web: { entry: "index.html", outdir: "dist" }, ...targets } },
    ...(dev ? { dev } : {}),
  });
}

/** The prerender step of a static esdev site: `ssg.js` run after the build. */
const ESDEV_SSG_TARGET = { "site-ssg": { entry: "ssg.js", out: ".ssg/ssg.js", then: "run" } };
const ESDEV_SITE_OUTPUT = { module: "@opentf/afw-cli/ssg", export: "siteOutputPlugin", options: { root: ".", target: "web", prerenderTarget: "site-ssg" } };
const ESDEV_SERVER = {
  targets: { server: { entry: "server.js", out: "dist/server.js" } },
  dev: { run: "server", app: { port: 3000 } },
};

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function viteConfig(ctx, { imports = [], plugins }) {
  const lines = [
    `import afw from "@opentf/vite-plugin-afw";`,
    ...(ctx.tailwind ? [`import tailwindcss from "@tailwindcss/vite";`] : []),
    ...imports,
    ...(ctx.ts ? [`import { defineConfig } from "vitest/config";`] : []),
  ];
  const all = [...plugins, ...(ctx.tailwind ? ["tailwindcss()"] : [])];
  return `${lines.join("\n")}

${ctx.ts ? "export default defineConfig(" : "export default "}{
  plugins: [${all.join(", ")}],
  test: {
    environment: "happy-dom",
    setupFiles: ["@opentf/afw-test/vitest"],
  },
}${ctx.ts ? ")" : ""};
`;
}

function tsconfig(ctx, include, { allowJs = false } = {}) {
  return json({
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ESNext", "DOM", "DOM.Iterable"],
      jsx: "preserve",
      jsxImportSource: "@opentf/afw",
      // esdev: the runtime's types, and the `esdev` condition `@opentf/afw-test/test` uses.
      ...(ctx.esdev
        ? { types: ["@opentf/esrun-types"], customConditions: ["esdev"] }
        : { types: ["@opentf/vite-plugin-afw/client"] }),
      strict: true,
      noEmit: true,
      isolatedModules: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      ...(allowJs ? { allowJs: true } : {}),
    },
    include,
  });
}

function indexHtml(ctx, { title, css = true }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHTML(title)}</title>${css ? `\n    <link rel="stylesheet" href="${ctx.esdev ? "./" : "/"}app/global.css" />` : ""}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${ctx.esdev ? "./" : "/"}entry.${ctx.js}"></script>
  </body>
</html>
`;
}

function entry(ctx, { importCss = false } = {}) {
  return `import { mountApp } from "@opentf/afw";
import { guard, loaderRoutes, pages } from "@afw/routes";
${importCss ? '\nimport "./app/global.css";\n' : ""}
mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app")${ctx.ts ? "!" : ""} });
`;
}

function globalCss(ctx) {
  if (ctx.tailwind) {
    return `@import "tailwindcss";

@layer base {
  body {
    @apply mx-auto max-w-3xl px-4 py-8 font-sans;
  }
}
`;
  }
  return `:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}

body {
  margin: 0 auto;
  max-width: 48rem;
  padding: 2rem 1rem;
}

nav {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}
`;
}

function counter(ctx) {
  return `export default function Counter({ start = 0 }${ctx.ts ? ": { start?: number }" : ""}) {
  let count = $state(start);
  const doubled = $derived(count * 2);

  return (
    <p>
      <button${tw(ctx, "rounded-md bg-sky-600 px-3 py-1 text-white")} onclick={() => count++}>Count: {count}</button> Doubled: {doubled}
    </p>
  );
}
`;
}

// Tests import the test API from `@opentf/afw-test/test`: Vitest under Vite,
// `runtime:test` under esdev, so the same files run in both workflows.
function counterTest(ctx, from) {
  return `import { expect, test } from "@opentf/afw-test/test";
import { render, userEvent } from "@opentf/afw-test";
import ${from.includes("/index.") ? "{ Counter }" : "Counter"} from "${from}";

test("counts clicks", async () => {
  const { getByRole, getByText } = render(Counter, { start: 1 });
  await userEvent.setup().click(getByRole("button", { name: "Count: 1" }));
  expect(getByRole("button").textContent).toBe("Count: 2");
  expect(getByText(/Doubled: 4/)).toBeTruthy();
});
`;
}

function readme(ctx, { summary, commands, notes = [] }) {
  const rows = commands.map(([command, what]) => `| \`${command}\` | ${what} |`).join("\n");
  return `# ${ctx.name}

${summary}

| Command | What it does |
| --- | --- |
${rows}
${notes.length ? `\n${notes.map((note) => `- ${note}`).join("\n")}\n` : ""}`;
}

// The DOM tests (`tests/ui/`) run with a DOM; server tests (`tests/server/`) run as
// server code, where `*.server.js` imports are the real functions.
const ESDEV_UI_TESTS = "esdev test --dom --setup=@opentf/afw-test/setup tests/ui";

function testScript(ctx, { server = false } = {}) {
  if (!ctx.esdev) return "vitest run";
  return server ? `esdev test tests/server && ${ESDEV_UI_TESTS}` : ESDEV_UI_TESTS;
}

function scripts(ctx, { server, client = false }) {
  if (ctx.esdev) {
    return {
      dev: "esdev start",
      build: "esdev build",
      ...(server
        ? { start: "esrun --allow-read --allow-net --allow-listen=3000 --allow-env=PORT --allow-imports dist/server.js" }
        : { preview: client ? "esdev preview --spa" : "esdev preview" }),
      test: testScript(ctx, { server }),
      ...(ctx.ts ? { typecheck: "esdev typecheck" } : {}),
    };
  }
  return {
    dev: "vite",
    build: "vite build",
    ...(server ? { start: "node dist/server/index.js" } : { preview: "vite preview" }),
    test: testScript(ctx),
    ...(ctx.ts ? { typecheck: "tsc" } : {}),
  };
}

const runner = (ctx) => (ctx.esdev ? "esdev" : "Vitest");

function commandRows(ctx, { server }) {
  const pm = ctx.pm;
  return [
    [`${pm} run dev`, "Start the dev server"],
    [`${pm} run build`, "Build for production"],
    server
      ? [`${pm} run start`, ctx.esdev ? "Run the built server on ES-Runtime (`PORT`)" : "Run the built Node server (`PORT`, `HOST`)"]
      : [`${pm} run preview`, "Preview the production build"],
    [`${pm} run test`, `Run the tests with ${runner(ctx)}`],
    ...(ctx.ts ? [[`${pm} run typecheck`, "Check types"]] : []),
  ];
}

const gitignore = (ctx) => (ctx.esdev ? esdevFile("gitignore") : "node_modules\ndist\n");

/** The toolchain's own config files for a project (`vite.config.*`, or `esdev.json` & co). */
const jsconfig = () => json({ compilerOptions: { jsx: "preserve", jsxImportSource: "@opentf/afw" } });

const onToolchain = (ctx) => (ctx.esdev ? "esdev and ES-Runtime" : "Vite");

// ---------------------------------------------------------------------------- app

/** `app/_config.*`: how the pages of a folder (and the folders below it) render. */
function routeConfig(ctx, render, comment) {
  return `import { defineRoute } from "@opentf/afw";

${comment}
export default defineRoute({ render: "${render}" });
`;
}

function appFiles(ctx) {
  const { ts, js, jsx, render, server } = ctx;
  const mixed = render === "mixed";
  const appDefault = mixed ? "server" : render;
  const files = {};
  files["package.json"] = json({
    name: ctx.name, private: true, type: "module", scripts: scripts(ctx, { server, client: render === "client" }),
    dependencies: { "@opentf/afw": version(ctx, "@opentf/afw") },
    devDependencies: devDependencies(ctx, ctx.esdev && render === "static" && !server ? { "@opentf/afw-cli": version(ctx, "@opentf/afw-cli") } : {}),
  });
  if (ctx.esdev) {
    // A static site without a server prerenders in a step after the build; a server
    // renders (and serves prebuilt) pages itself.
    const site = render === "static" && !server;
    files["esdev.json"] = esdevConfig(ctx, {
      plugins: site ? [ESDEV_SITE_OUTPUT] : [],
      targets: { ...(server ? ESDEV_SERVER.targets : {}), ...(site ? ESDEV_SSG_TARGET : {}) },
      dev: server ? ESDEV_SERVER.dev : null,
    });
    if (server) files["server.js"] = esdevFile("server.js");
    if (site) files["ssg.js"] = esdevFile("ssg.js");
    if (!ts) files["jsconfig.json"] = jsconfig();
  } else {
    const options = render === "static" ? `{ baseUrl: "" /* your site URL, e.g. "https://example.com", enables sitemap.xml */ }` : "";
    files[`vite.config.${js}`] = viteConfig(ctx, { plugins: [`afw(${options})`] });
  }
  if (ts) files["tsconfig.json"] = tsconfig(ctx, ctx.esdev ? ["app", "tests", "entry.ts"] : ["app", "tests", "entry.ts", "vite.config.ts"]);
  files["index.html"] = indexHtml(ctx, { title: ctx.name });
  files[`entry.${js}`] = entry(ctx);
  files["app/global.css"] = globalCss(ctx);
  files[`app/_config.${js}`] = routeConfig(ctx, appDefault, `// How the pages in app/ render: "server" (per request), "static" (once, at build time) or
// "client" (in the browser). A folder's own _config.${js} sets it for that folder and
// the folders below it; the nearest one wins.`);

  const navLinks = [["/", "Home"], ["/about", "About"], ...(server ? [["/todos", "Todos"]] : []), ...(mixed ? [["/dashboard", "Dashboard"]] : [])];
  files[`app/layout.${jsx}`] = `import { Link } from "@opentf/afw";

export default function Layout({ children }${ts ? ": { children: unknown }" : ""}) {
  return (
    <>
      <nav${tw(ctx, "mb-8 flex gap-4 text-sky-700")}>
${navLinks.map(([href, label]) => `        <Link href="${href}">${label}</Link>`).join("\n")}
      </nav>
      <main>{children}</main>
    </>
  );
}
`;
  files[`app/page.${jsx}`] = `import Counter from "./Counter.${jsx}";

export const metadata = { title: "${escapeJs(ctx.name)}" };

export default function Home() {
  return (
    <section>
      <h1${tw(ctx, "mb-4 text-3xl font-bold")}>${escapeHTML(ctx.name)}</h1>
      <p>Edit <code>app/page.${jsx}</code> and save: the page updates in place.</p>
      <Counter start={0} />
    </section>
  );
}
`;
  files[`app/Counter.${jsx}`] = counter(ctx);
  files["app/about/page.md"] = `---
title: About
---

# About

This page is Markdown. The AFW compiler turns it into a page like any other.
`;
  if (mixed) Object.assign(files, mixedFiles(ctx));
  if (server) Object.assign(files, serverFiles(ctx));
  files[`tests/ui/Counter.test.${js}`] = counterTest(ctx, `../../app/Counter.${jsx}`);
  files[".gitignore"] = gitignore(ctx);

  const how = {
    client: "rendered in the browser",
    server: "rendered on the server per request",
    static: "prerendered to static HTML",
    mixed: "rendered on the server by default, with a prebuilt page (`/about`) and a section rendered in the browser (`/dashboard`)",
  }[render];
  const host = ctx.esdev ? "ES-Runtime" : "Node";
  files["README.md"] = readme(ctx, {
    summary: `An [AFW](https://afw.opentechf.org) app on ${onToolchain(ctx)}: pages ${how}${server ? `, with a server on ${host}` : ""}.`,
    commands: commandRows(ctx, { server }),
    notes: [
      `Pages live in \`app/\`: \`app/about/page.md\` is served at \`/about\`.`,
      `\`app/_config.${js}\` sets how pages render (\`server\`, \`static\` or \`client\`); a folder's own \`_config.${js}\` changes it for that folder.`,
      `Component tests live in \`tests/ui/\`${server ? ", server tests (API routes, loaders) in `tests/server/`" : ""}.`,
      ...(server ? [
        `On the server: API routes (\`app/api/hello/route.${js}\`), middleware (\`app/_middleware.${js}\`), a loader (\`app/todos/loader.${js}\`) and server functions (\`app/todos/todos.server.${js}\`), which components call like async functions.`,
      ] : []),
      ...(ctx.tailwind ? ["Styled with Tailwind CSS: utility classes go straight into `class`."] : []),
    ],
  });
  return files;
}

/** The mixed app's examples: a prebuilt page and a section rendered in the browser. */
function mixedFiles(ctx) {
  const { ts, js, jsx } = ctx;
  const files = {};
  files[`app/about/_config.${js}`] = routeConfig(ctx, "static", "// Built once at build time; the rest of the app renders per request.");
  files[`app/dashboard/_config.${js}`] = routeConfig(ctx, "client", `// Rendered in the browser: the server sends the layout and this folder's loader data,
// and never loads its pages, so they may use browser-only code.`);
  files[`app/dashboard/loader.${js}`] = `// Still runs on the server: a client page gets its data with the page.
export default function loader() {
  return { visits: 42 };
}
`;
  files[`app/dashboard/page.${jsx}`] = `import { router } from "@opentf/afw";

export const metadata = { title: "Dashboard" };

export default function Dashboard() {
  const visits = $derived(${ts ? "(router.data as { visits?: number } | undefined)" : "router.data"}?.visits ?? 0);
  return (
    <section>
      <h1${tw(ctx, "mb-4 text-2xl font-bold")}>Dashboard</h1>
      <p>Rendered in your browser, {visits} visits. Browser-only code is safe here.</p>
    </section>
  );
}
`;
  return files;
}

function serverFiles(ctx) {
  const { ts, js, jsx } = ctx;
  const files = {};
  files[`tests/server/api.test.${js}`] = `import { expect, test } from "@opentf/afw-test/test";
import { GET } from "../../app/api/hello/route.${js}";

test("GET /api/hello greets by name", async () => {
  const response = GET(new Request("http://localhost/api/hello?name=AFW"), { query: { name: "AFW" }, locals: { requestId: "r1" } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, AFW!", requestId: "r1" });
});
`;
  files[`app/api/hello/route.${js}`] = `// GET /api/hello?name=… — API routes run on Node, so any npm package works here.
export function GET(request${ts ? ": Request" : ""}, { query, locals }${ts ? ": { query: Record<string, string>; locals: Record<string, unknown> }" : ""}) {
  return Response.json({ message: \`Hello, \${query.name ?? "world"}!\`, requestId: locals.requestId });
}
`;
  files[`app/_middleware.${js}`] = `// Runs for every request: pages, API routes, loader data and server functions alike.
// Authenticate here (set \`context.locals.user\`); each server function checks what
// that user may read or change.
export default async function middleware(request${ts ? ": Request" : ""}, context${ts ? ": { locals: Record<string, unknown> }" : ""}, next${ts ? ": () => Promise<Response>" : ""}) {
  context.locals.requestId = crypto.randomUUID();
  const response = await next();
  response.headers.set("x-request-id", String(context.locals.requestId));
  return response;
}
`;
  files[`app/todos/todos.server.${js}`] = `// Server functions: this module runs only on the server. Components import the
// functions below and call them like async functions; the browser gets fetch stubs.
import { action, query } from "@opentf/afw/server";

// In memory for the example: use your database here.
const todos${ts ? ": string[]" : ""} = ["Try the dev server", "Add an API route", "Deploy with npm start"];

export const listTodos = query(async () => todos);

export const addTodo = action(async ({ title }${ts ? ": { title: string }" : ""}) => {
  const text = String(title ?? "").trim();
  if (!text) throw new Response(null, { status: 400 });
  todos.push(text);
  return todos;
});
`;
  files[`app/todos/loader.${js}`] = `// Loaders run on the server and feed their page through \`router.data\`. A server
// function called from server code runs directly, with no HTTP request.
import { listTodos } from "./todos.server.${js}";

export default async function loader({ locals }${ts ? ": { locals: Record<string, unknown> }" : ""}) {
  return { todos: await listTodos(undefined, { locals }) };
}
`;
  files[`app/todos/page.${jsx}`] = `import { invalidate, router } from "@opentf/afw";
import { addTodo } from "./todos.server.${js}";

export const metadata = { title: "Todos" };

export default function Todos() {
  let title = $state("");
  const todos = $derived(${ts ? "(router.data as { todos?: string[] } | undefined)" : "router.data"}?.todos ?? []);

  async function add(event${ts ? ": SubmitEvent" : ""}) {
    event.preventDefault();
    await addTodo({ title });
    title = "";
    await invalidate(); // reload this page's loader data
  }

  return (
    <section>
      <h1${tw(ctx, "mb-4 text-2xl font-bold")}>Todos</h1>
      <ul${tw(ctx, "mb-4 list-disc pl-6")}>
        {todos.map((todo${ts ? ": string" : ""}) => <li>{todo}</li>)}
      </ul>
      <form onsubmit={add}>
        <input${tw(ctx, "rounded-md border px-2 py-1")} value={title} oninput={(e${ts ? ": Event" : ""}) => (title = (e.target${ts ? " as HTMLInputElement" : ""}).value)} placeholder="New todo" />
        <button${tw(ctx, "ml-2 rounded-md bg-sky-600 px-3 py-1 text-white")} type="submit">Add</button>
      </form>
    </section>
  );
}
`;
  return files;
}

// ---------------------------------------------------------------------------- docs

function docsFiles(ctx) {
  const { ts, js, jsx, blog } = ctx;
  const files = {};
  files["package.json"] = json({
    name: ctx.name, private: true, type: "module", scripts: scripts(ctx, { server: false }),
    dependencies: { "@opentf/afw": version(ctx, "@opentf/afw"), "@opentf/afw-docs": version(ctx, "@opentf/afw-docs") },
    devDependencies: devDependencies({ ...ctx, tailwind: false }, ctx.esdev ? { "@opentf/afw-cli": version(ctx, "@opentf/afw-cli") } : {}),
  });
  if (ctx.esdev) {
    files["esdev.json"] = esdevConfig(ctx, {
      plugins: [{ module: "@opentf/afw-docs/build", export: "afwDocsPlugin", options: { appDir: "app" } }, ESDEV_SITE_OUTPUT],
      targets: ESDEV_SSG_TARGET,
    });
    files["ssg.js"] = esdevFile("ssg.js");
    if (!ts) files["jsconfig.json"] = jsconfig();
  } else {
    files[`vite.config.${js}`] = viteConfig({ ...ctx, tailwind: false }, {
      imports: [`import afwDocs from "@opentf/afw-docs/vite";`],
      plugins: ["afw()", "afwDocs()"],
    });
  }
  files[`app/_config.${js}`] = routeConfig(ctx, "static", "// The site is prerendered: every page is built once, at build time.");
  if (ts) files["tsconfig.json"] = tsconfig(ctx, ctx.esdev ? ["app", "tests", "entry.ts", "afw.config.js"] : ["app", "tests", "entry.ts", "vite.config.ts", "afw.config.js"], { allowJs: true });
  files["afw.config.js"] = `import { defineDocsConfig } from "@opentf/afw-docs/config";

export default defineDocsConfig({
  // Your site's URL: canonical links, sitemap.xml${blog ? ", feeds" : ""} and llms.txt use it.
  site: { url: "https://example.com" },
  docs: {
    title: "${escapeJs(ctx.name)}",
    nav: [
      { label: "Docs", href: "/docs" },${blog ? `
      { label: "Blog", href: "/blog" },` : ""}
    ],
    search: { provider: "afw" },
  },${blog ? `
  blog: { dir: "blog", title: "${escapeJs(ctx.name)} Blog" },` : ""}
});
`;
  files["index.html"] = indexHtml(ctx, { title: ctx.name, css: false });
  files[`entry.${js}`] = entry(ctx, { importCss: true });
  files["app/global.css"] = `@import "@opentf/afw-docs/theme";
`;
  files[`app/layout.${jsx}`] = `export default function Root({ children }${ts ? ": { children: unknown }" : ""}) {
  return <div>{children}</div>;
}
`;
  files[`app/page.${jsx}`] = `import { Link } from "@opentf/afw";

export const metadata = { title: "${escapeJs(ctx.name)}", description: "${blog ? "Documentation and blog." : "Documentation."}" };

export default function Home() {
  return (
    <main class="afwd-prose">
      <h1>${escapeHTML(ctx.name)}</h1>
      <p>${blog ? "Documentation and a blog" : "Documentation"}, written in MDX.</p>
      <p>
        <Link href="/docs">Read the docs</Link>${blog ? ` · <Link href="/blog">Visit the blog</Link>` : ""}
      </p>
    </main>
  );
}
`;
  files[`app/docs/layout.${jsx}`] = `import { DocsLayout } from "@opentf/afw-docs";
import config from "../../afw.config.js";

export default function Docs({ children }${ts ? ": { children: unknown }" : ""}) {
  return <DocsLayout config={config.docs} siteUrl={config.site.url}>{children}</DocsLayout>;
}
`;
  files["app/docs/_meta.js"] = `// Sidebar order and labels. Folders not listed here follow, alphabetically.
export default {
  "getting-started": "Getting Started",
  guides: "Guides",
};
`;
  files["app/docs/page.mdx"] = `---
title: Introduction
description: What this project is and where to start.
---

import { Callout } from "@opentf/afw-docs";

# Introduction

Welcome to the ${escapeHTML(ctx.name)} docs.

<Callout type="tip">
  Every folder under \`app/docs/\` with a \`page.mdx\` becomes a page in the sidebar.
</Callout>
`;
  files["app/docs/getting-started/page.mdx"] = `---
title: Getting Started
description: Install and run the project.
---

# Getting Started

\`\`\`bash
${ctx.pm} install
${ctx.pm} run dev
\`\`\`
`;
  files["app/docs/guides/writing-pages/page.mdx"] = `---
title: Writing Pages
description: MDX pages, components and code blocks.
---

import { Steps } from "@opentf/afw-docs";

# Writing Pages

<Steps>

### Add a folder

Create \`app/docs/my-topic/page.mdx\`.

### Write MDX

Markdown with components, like this list of steps.

</Steps>
`;
  if (blog) Object.assign(files, blogFiles(ctx));
  files[`tests/ui/Home.test.${js}`] = `import { expect, test } from "@opentf/afw-test/test";
import { render } from "@opentf/afw-test";
import Home from "../../app/page.${jsx}";

test("the home page links to the docs${blog ? " and the blog" : ""}", () => {
  const { getByRole } = render(Home);
  expect(getByRole("heading", { level: 1 }).textContent).toBe("${escapeJs(ctx.name)}");
  expect(getByRole("link", { name: "Read the docs" }).getAttribute("href")).toBe("/docs");${blog ? `
  expect(getByRole("link", { name: "Visit the blog" }).getAttribute("href")).toBe("/blog");` : ""}
});
`;
  files[".gitignore"] = gitignore(ctx);
  files["README.md"] = readme(ctx, {
    summary: `A documentation site${blog ? " and blog" : ""} built with [AFW](https://afw.opentechf.org) and \`@opentf/afw-docs\` on ${onToolchain(ctx)}.`,
    commands: commandRows(ctx, { server: false }),
    notes: [
      `Docs pages live in \`app/docs/\`${blog ? ", posts in \`app/blog/\`" : ""}; \`app/docs/_meta.js\` orders the sidebar.`,
      `\`${ctx.pm} run build\` prerenders every page and writes the search index, \`sitemap.xml\`${blog ? ", RSS and Atom feeds" : ""} and \`llms.txt\`.`,
      "Set your site's URL in `afw.config.js`.",
    ],
  });
  return files;
}

/** The blog of a docs site: its layout, the post list and a first post. */
function blogFiles(ctx) {
  const { ts, jsx } = ctx;
  const files = {};
  files[`app/blog/layout.${jsx}`] = `import { BlogLayout } from "@opentf/afw-docs";
import { posts } from "@opentf/afw-docs/posts";
import config from "../../afw.config.js";

export default function Blog({ children }${ts ? ": { children: unknown }" : ""}) {
  return <BlogLayout config={config.docs} posts={posts} siteUrl={config.site.url}>{children}</BlogLayout>;
}
`;
  files[`app/blog/page.${jsx}`] = `import { PostList } from "@opentf/afw-docs";
import { posts } from "@opentf/afw-docs/posts";

export const metadata = { title: "Blog" };

export default function BlogIndex() {
  return (
    <section>
      <h1>Blog</h1>
      <PostList posts={posts} />
    </section>
  );
}
`;
  files["app/blog/hello-world/page.mdx"] = `---
title: Hello, world
description: The first post.
date: 2026-01-01
author: ${escapeHTML(ctx.name)}
---

# Hello, world

Posts live in \`app/blog/\`; each one appears in the post list and the RSS and Atom feeds.
`;
  return files;
}

// ---------------------------------------------------------------------------- library

function libraryFiles(ctx) {
  const { ts, js, jsx } = ctx;
  const files = {};
  const afw = version(ctx, "@opentf/afw");
  files["package.json"] = json({
    name: ctx.name,
    version: "0.1.0",
    type: "module",
    // Published as source: the consuming app's AFW plugin compiles it.
    exports: { ".": `./index.${js}` },
    files: [`index.${js}`, "src"],
    sideEffects: false,
    scripts: ctx.esdev
      ? { dev: "esdev start", test: testScript(ctx), ...(ts ? { typecheck: "esdev typecheck" } : {}) }
      : { dev: "vite", test: testScript(ctx), ...(ts ? { typecheck: "tsc" } : {}) },
    // A range: apps keep their own AFW release within it.
    peerDependencies: { "@opentf/afw": afw.startsWith("^") ? afw : `^${afw}` },
    devDependencies: devDependencies(ctx, { "@opentf/afw": afw }),
  });
  if (ctx.esdev) {
    files["esdev.json"] = esdevConfig(ctx);
    if (!ts) files["jsconfig.json"] = jsconfig();
  } else {
    files[`vite.config.${js}`] = viteConfig(ctx, { plugins: ["afw()"] });
  }
  if (ts) files["tsconfig.json"] = tsconfig(ctx, ctx.esdev ? ["index.ts", "src", "app", "tests", "entry.ts"] : ["index.ts", "src", "app", "tests", "entry.ts", "vite.config.ts"]);
  files[`index.${js}`] = `// The package entry: export each component.
export { default as Counter } from "./src/Counter.${jsx}";
`;
  files[`src/Counter.${jsx}`] = counter(ctx);
  // The preview app (\`npm run dev\`): not published.
  files["index.html"] = indexHtml(ctx, { title: `${ctx.name} preview` });
  files[`entry.${js}`] = entry(ctx);
  files["app/global.css"] = globalCss(ctx);
  files[`app/page.${jsx}`] = `import { Counter } from "../index.${js}";

export default function Preview() {
  return (
    <section>
      <h1${tw(ctx, "mb-4 text-2xl font-bold")}>${escapeHTML(ctx.name)}</h1>
      <Counter start={1} />
    </section>
  );
}
`;
  files[`tests/ui/Counter.test.${js}`] = counterTest(ctx, `../../index.${js}`);
  files[".gitignore"] = gitignore(ctx);
  files["README.md"] = readme(ctx, {
    summary: "A component library for [AFW](https://afw.opentechf.org), published as JSX source.",
    commands: [
      [`${ctx.pm} run dev`, "Preview the components (`app/page." + jsx + "`)"],
      [`${ctx.pm} run test`, `Run the tests with ${runner(ctx)}`],
      ...(ts ? [[`${ctx.pm} run typecheck`, "Check types"]] : []),
      [`${ctx.pm} publish`, "Publish `index." + js + "` and `src/`"],
    ],
    notes: [
      `Export each component from \`index.${js}\`.`,
      "Apps install it next to `@opentf/afw` (a peer dependency); their AFW plugin compiles it, with Vite or esdev.",
      ...(ctx.tailwind ? ["Components use Tailwind classes: apps that use Tailwind add `@source \"../node_modules/" + ctx.name + "\";` to their stylesheet so the classes are generated."] : []),
    ],
  });
  return files;
}
