// Per-route render policies (`_config.js`) under esdev: a mixed app — server by default,
// a static page and a client section whose page reads `window` as it loads — built as
// esdev's server and browser targets build it.
import { afterAll, expect, test } from "runtime:test";
import { build } from "runtime:build";
import { makeTempDir, mkdir, remove, write } from "runtime:fs";
import { dirname, fromFileURL, join, resolve } from "runtime:path";
import { cwd } from "runtime:process";

import { closeCompilers, createAfwAppPlugin } from "../index.js";

afterAll(() => closeCompilers());

const PACKAGES = join(dirname(fromFileURL(import.meta.url)), "../..");
// A bare @opentf/* specifier left in a bundle → its workspace file.
function workspaceFile(spec) {
  const table = {
    "@opentf/afw": "afw/index.js", "@opentf/afw/server": "afw/server/index.js",
    "@opentf/afw-build/document": "afw-build/document.js",
  };
  if (!table[spec]) throw new Error(`unmapped external ${spec}`);
  return join(PACKAGES, table[spec]);
}

async function mixedApp() {
  await mkdir(".cache", { recursive: true });
  const dir = resolve(cwd(), await makeTempDir({ dir: ".cache", prefix: "policies-" }));
  const app = join(dir, "app");
  const file = async (rel, source) => {
    await mkdir(dirname(join(app, rel)), { recursive: true });
    await write(join(app, rel), source);
  };
  await file("_config.js", 'import { defineRoute } from "@opentf/afw";\nexport default defineRoute({ render: "server" });\n');
  await file("layout.jsx", "export default function Layout({ children }) { return <main>{children}</main>; }\n");
  await file("page.jsx", 'export default function Home() { return <h1 id="home">home</h1>; }\n');
  await file("about/_config.js", 'export default { render: "static" };\n');
  await file("about/page.jsx", 'export default function About() { return <h1 id="about">about</h1>; }\n');
  await file("dashboard/_config.js", 'export default { render: "client" };\n');
  await file("dashboard/loader.js", "export default function loader() { return { visits: 42 }; }\n");
  await file("dashboard/page.jsx", `const width = window.innerWidth;
export default function Dashboard() { return <p id="dash">DASHBOARD_ONLY {width}</p>; }
`);
  await write(join(dir, "server.js"), `
    import { createHandler, createPageRenderer } from "@afw/server";
    const shell = '<!doctype html><html><head><title>t</title></head><body><div id="app"></div></body></html>';
    export const handle = createHandler({ renderPage: createPageRenderer({ shell }), fallback: () => new Response("fallback", { status: 404 }) });
  `);
  await write(join(dir, "client.js"), 'import { pages } from "@afw/routes"; globalThis.pages = pages;');
  return { dir, app };
}

async function bundle(input, platform) {
  const out = await build({ input, platform, plugins: [createAfwAppPlugin()] });
  try {
    return (await out.generate({ format: "esm" })).output.map((chunk) => chunk.code ?? "").join("\n");
  } finally {
    await out.close();
  }
}

test("the server bundle leaves client pages out and labels each response with its policy", async () => {
  const { dir } = await mixedApp();
  try {
    const code = await bundle(join(dir, "server.js"), "server");
    expect(code).not.toContain("DASHBOARD_ONLY");
    expect(code).not.toContain("window.innerWidth");
    let linked = code;
    for (const spec of new Set([...code.matchAll(/from "(@opentf\/[^"]+)"/g)].map((m) => m[1]))) {
      linked = linked.replaceAll(`"${spec}"`, JSON.stringify(workspaceFile(spec)));
    }
    await write(join(dir, "server.bundle.js"), linked);
    const { handle } = await import(join(dir, "server.bundle.js"));
    const page = (path) => handle(new Request(`http://app.test${path}`, { headers: { accept: "text/html" } }));

    const home = await page("/");
    expect(home.headers.get("x-afw-render")).toBe("server");
    expect((await home.text()).replace(/<!--[^>]*-->/g, "")).toContain('<h1 id="home">home</h1>');

    const about = await page("/about");
    expect(about.headers.get("x-afw-render")).toBe("static");

    const dashboard = await page("/dashboard");
    expect(dashboard.headers.get("x-afw-render")).toBe("client");
    const html = await dashboard.text();
    expect(html).toContain("<main><!--[--><!--]--></main>");
    expect(html).toContain('{"visits":42}');
    expect(html).toContain("data-afw-hydrate");
  } finally {
    await remove(dir, { recursive: true });
  }
});

test("the browser's route table marks the client entries", async () => {
  const { dir } = await mixedApp();
  try {
    const code = await bundle(join(dir, "client.js"), "browser");
    expect(code).toContain("__afwClient: true");
    expect(code).toContain("DASHBOARD_ONLY"); // the browser has the page, lazily
  } finally {
    await remove(dir, { recursive: true });
  }
});

test("a server page inside a client layout stops the build", async () => {
  const { dir, app } = await mixedApp();
  try {
    await write(join(app, "dashboard", "layout.jsx"), "export default function L({ children }) { return <section>{children}</section>; }\n");
    await mkdir(join(app, "dashboard", "public"), { recursive: true });
    await write(join(app, "dashboard", "public", "_config.js"), 'export default { render: "server" };\n');
    await write(join(app, "dashboard", "public", "page.jsx"), "export default function P() { return <p>public</p>; }\n");
    await expect(bundle(join(dir, "server.js"), "server")).rejects.toThrow('the layout in app/dashboard/ renders "client"');
  } finally {
    await remove(dir, { recursive: true });
  }
});
