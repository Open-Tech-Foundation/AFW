// The Vite + Node project templates. Each template is generated from one source for
// both JavaScript and TypeScript, so the two never drift apart.

import { escapeHTML } from "@opentf/std";

export const TEMPLATES = {
  spa: "Single-page app, rendered in the browser",
  fullstack: "SPA plus API routes, middleware and loaders on a Node server",
  ssr: "Server-rendered pages on a Node server, hydrated in the browser",
  ssg: "Every page prerendered to static HTML at build time",
};

// The third-party tools a new project starts on. AFW's own packages take the
// versions this scaffolder was released with (versions.js).
export const TOOL_VERSIONS = {
  vite: "^8.3.5",
  vitest: "^5.0.5",
  "happy-dom": "^21.0.4",
  typescript: "^6.0.3",
};

const MODE = { spa: "spa", fullstack: "spa", ssr: "ssr", ssg: "ssg" };
const hasServer = (template) => template === "fullstack" || template === "ssr";

/**
 * The files of a new project, as `{ relativePath: contents }`.
 *
 * @param {{ name: string, template: keyof TEMPLATES, typescript: boolean, versions: Record<string, string> }} options
 */
export function projectFiles({ name, template, typescript, versions }) {
  if (!TEMPLATES[template]) throw new Error(`Unknown template "${template}". Choose one of: ${Object.keys(TEMPLATES).join(", ")}`);
  const ts = typescript;
  const js = ts ? "ts" : "js";
  const jsx = ts ? "tsx" : "jsx";
  const server = hasServer(template);
  const mode = MODE[template];
  const files = {};

  const scripts = { dev: "vite", build: "vite build" };
  if (server) scripts.start = "node dist/server/index.js";
  else scripts.preview = "vite preview";
  scripts.test = "vitest run";
  if (ts) scripts.typecheck = "tsc";
  const devDependencies = {
    "@opentf/afw-test": versions["@opentf/afw-test"],
    "@opentf/vite-plugin-afw": versions["@opentf/vite-plugin-afw"],
    "happy-dom": TOOL_VERSIONS["happy-dom"],
    ...(ts ? { typescript: TOOL_VERSIONS.typescript } : {}),
    vite: TOOL_VERSIONS.vite,
    vitest: TOOL_VERSIONS.vitest,
  };
  files["package.json"] = json({
    name, private: true, type: "module", scripts,
    dependencies: { "@opentf/afw": versions["@opentf/afw"] },
    devDependencies,
  });

  files[`vite.config.${js}`] = `import afw from "@opentf/vite-plugin-afw";
${ts ? 'import { defineConfig } from "vitest/config";\n' : ""}
${ts ? "export default defineConfig(" : "export default "}{
  plugins: [afw({ mode: "${mode}"${mode === "ssg" ? ', baseUrl: "" /* your site URL, e.g. "https://example.com", enables sitemap.xml */' : ""} })],
  test: {
    environment: "happy-dom",
    setupFiles: ["@opentf/afw-test/vitest"],
  },
}${ts ? ")" : ""};
`;

  if (ts) {
    files["tsconfig.json"] = json({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        jsx: "preserve",
        jsxImportSource: "@opentf/afw",
        types: ["@opentf/vite-plugin-afw/client"],
        strict: true,
        noEmit: true,
        isolatedModules: true,
        skipLibCheck: true,
        allowImportingTsExtensions: true,
      },
      include: ["app", "tests", "entry.ts", "vite.config.ts"],
    });
  }

  files["index.html"] = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHTML(name)}</title>
    <link rel="stylesheet" href="/app/global.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/entry.${js}"></script>
  </body>
</html>
`;

  files[`entry.${js}`] = `import { mountApp } from "@opentf/afw";
import { guard, loaderRoutes, pages } from "@afw/routes";

mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app")${ts ? "!" : ""} });
`;

  files["app/global.css"] = `:root {
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

  const navLinks = [["/", "Home"], ["/about", "About"], ...(server ? [["/todos", "Todos"]] : [])];
  files[`app/layout.${jsx}`] = `import { Link } from "@opentf/afw";

export default function Layout({ children }${ts ? ": { children: unknown }" : ""}) {
  return (
    <>
      <nav>
${navLinks.map(([href, label]) => `        <Link href="${href}">${label}</Link>`).join("\n")}
      </nav>
      <main>{children}</main>
    </>
  );
}
`;

  files[`app/page.${jsx}`] = `import Counter from "./Counter.${jsx}";

export const metadata = { title: "${escapeJs(name)}" };

export default function Home() {
  return (
    <section>
      <h1>${escapeHTML(name)}</h1>
      <p>Edit <code>app/page.${jsx}</code> and save: the page updates in place.</p>
      <Counter start={0} />
    </section>
  );
}
`;

  files[`app/Counter.${jsx}`] = `export default function Counter({ start = 0 }${ts ? ": { start?: number }" : ""}) {
  let count = $state(start);
  const doubled = $derived(count * 2);

  return (
    <p>
      <button onclick={() => count++}>Count: {count}</button> Doubled: {doubled}
    </p>
  );
}
`;

  files["app/about/page.md"] = `---
title: About
---

# About

This page is Markdown. The AFW compiler turns it into a page like any other.
`;

  if (server) {
    files[`app/api/hello/route.${js}`] = `// GET /api/hello?name=… — API routes run on Node, so any npm package works here.
export function GET(request${ts ? ": Request" : ""}, { query, locals }${ts ? ": { query: Record<string, string>; locals: Record<string, unknown> }" : ""}) {
  return Response.json({ message: \`Hello, \${query.name ?? "world"}!\`, requestId: locals.requestId });
}
`;
    files[`app/_middleware.${js}`] = `// Runs for every request: pages, API routes and loader data alike.
export default async function middleware(request${ts ? ": Request" : ""}, context${ts ? ": { locals: Record<string, unknown> }" : ""}, next${ts ? ": () => Promise<Response>" : ""}) {
  context.locals.requestId = crypto.randomUUID();
  const response = await next();
  response.headers.set("x-request-id", String(context.locals.requestId));
  return response;
}
`;
    files[`app/todos/loader.${js}`] = `// Loaders run on the server and feed their page through \`router.data\`.
const todos = ["Try the dev server", "Add an API route", "Deploy with npm start"];

export default async function loader() {
  return { todos };
}
`;
    files[`app/todos/page.${jsx}`] = `import { router } from "@opentf/afw";

export const metadata = { title: "Todos" };

export default function Todos() {
  return (
    <section>
      <h1>Todos</h1>
      <ul>
        {(${ts ? "(router.data as { todos?: string[] } | undefined)" : "router.data"}?.todos ?? []).map((todo${ts ? ": string" : ""}) => <li>{todo}</li>)}
      </ul>
    </section>
  );
}
`;
  }

  files[`tests/Counter.test.${js}`] = `import { expect, test } from "vitest";
import { render, userEvent } from "@opentf/afw-test";
import Counter from "../app/Counter.${jsx}";

test("counts clicks", async () => {
  const { getByRole, getByText } = render(Counter, { start: 1 });
  await userEvent.setup().click(getByRole("button", { name: "Count: 1" }));
  expect(getByRole("button").textContent).toBe("Count: 2");
  expect(getByText(/Doubled: 4/)).toBeTruthy();
});
`;

  files[".gitignore"] = "node_modules\ndist\n";

  const run = (script) => `npm run ${script}`;
  files["README.md"] = `# ${name}

An [AFW](https://afw.opentechf.org) app on Vite and Node (${TEMPLATES[template].toLowerCase()}).

| Command | What it does |
| --- | --- |
| \`${run("dev")}\` | Start the dev server |
| \`${run("build")}\` | Build for production |
| ${server ? `\`npm start\` | Run the built Node server (\`PORT\`, \`HOST\`)` : `\`${run("preview")}\` | Preview the production build`} |
| \`${run("test")}\` | Run the tests with Vitest |
${ts ? `| \`${run("typecheck")}\` | Check types |\n` : ""}
Pages live in \`app/\`: \`app/about/page.md\` is served at \`/about\`.${server ? " API routes (`route." + js + "`), middleware (`_middleware." + js + "`) and loaders (`loader." + js + "`) run on Node." : ""}
`;
  return files;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeJs(text) {
  return String(text).replace(/[\\"]/g, "\\$&");
}
