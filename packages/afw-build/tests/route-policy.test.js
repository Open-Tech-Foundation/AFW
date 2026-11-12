import { describe, expect, test } from "runtime:test";

import {
  discoverRouteConfigs, folderRoute, formatRouteTable, readRouteConfigs, resolveRoutePolicies, routeManifest,
} from "../index.js";
import { memoryHost } from "./memory-host.js";

// The compiler's `route-config` answer, scripted per file: `{ render, data, paths }`.
const compilerFor = (answers) => ({
  async compile(file, _source, component, target) {
    expect(component).toBe(false);
    expect(target).toBe("route-config");
    if (answers[file] instanceof Error) throw answers[file];
    return JSON.stringify({ render: null, data: null, paths: false, ...answers[file] });
  },
});

const ROOT = "/site/app";
const at = (rel) => `${ROOT}/${rel}`;

async function resolveApp(files, answers, options = {}) {
  const host = memoryHost(Object.fromEntries(Object.entries(files).map(([rel, src]) => [at(rel), src])));
  const configs = await readRouteConfigs(host, compilerFor(Object.fromEntries(Object.entries(answers).map(([rel, a]) => [at(rel), a]))),
    await discoverRouteConfigs(host, ROOT, options));
  const pages = Object.keys(files).filter((rel) => /(^|\/)(page|layout|404)\.[a-z]+$/.test(rel)).map(at);
  return resolveRoutePolicies({ root: ROOT, pages, configs, mode: options.mode });
}

// The WordPress-like app from the design: server by default, static legal pages and
// about, a client admin section, and one static page inside a server section.
const SITE = {
  "_config.js": "", "page.jsx": "", "layout.jsx": "", "404.jsx": "",
  "articles/_config.js": "", "articles/page.jsx": "", "articles/[slug]/page.jsx": "",
  "articles/archive/_config.js": "", "articles/archive/page.jsx": "",
  "(legal)/_config.js": "", "(legal)/privacy/page.jsx": "", "(legal)/terms/page.mdx": "",
  "admin/_config.ts": "", "admin/layout.jsx": "", "admin/page.jsx": "", "admin/editor/page.jsx": "",
};
const SITE_CONFIG = {
  "_config.js": { render: "server" },
  "articles/_config.js": { render: "server" },
  "articles/archive/_config.js": { render: "static" },
  "(legal)/_config.js": { render: "static" },
  "admin/_config.ts": { render: "client" },
};

describe("route policies", () => {
  test("the nearest _config.js wins, through groups, down the folder tree", async () => {
    const { defaultRender, routes } = await resolveApp(SITE, SITE_CONFIG);
    expect(defaultRender).toBe("server");
    expect(routes.map((r) => [r.route, r.render, r.from.replace(`${ROOT}/`, "")])).toEqual([
      ["/", "server", "_config.js"],
      ["/admin", "client", "admin/_config.ts"],
      ["/admin/editor", "client", "admin/_config.ts"],
      ["/articles", "server", "articles/_config.js"],
      ["/articles/[slug]", "server", "articles/_config.js"],
      ["/articles/archive", "static", "articles/archive/_config.js"],
      ["/privacy", "static", "(legal)/_config.js"],
      ["/terms", "static", "(legal)/_config.js"],
    ]);
  });

  test("client routes run their loaders on the server unless data says client", async () => {
    const { routes, policyOf } = await resolveApp(SITE, { ...SITE_CONFIG, "admin/_config.ts": { render: "client", data: "client" } });
    expect(routes.find((r) => r.route === "/admin").data).toBe("client");
    expect(routes.find((r) => r.route === "/").data).toBe(null);
    expect(policyOf("admin/editor")).toEqual({ render: "client", data: "client", from: at("admin/_config.ts") });
    const plain = await resolveApp(SITE, SITE_CONFIG);
    expect(plain.routes.find((r) => r.route === "/admin").data).toBe("server");
  });

  test("layouts resolve like pages: a layout's folder decides how it renders", async () => {
    const { policyOf } = await resolveApp(SITE, SITE_CONFIG);
    expect(policyOf("").render).toBe("server");
    expect(policyOf("admin").render).toBe("client");
  });

  test("without a root _config.js the plugin's mode is the default", async () => {
    const files = { "page.jsx": "", "about/_config.js": "", "about/page.jsx": "" };
    for (const [mode, render, from] of [["ssr", "server", 'mode: "ssr"'], ["ssg", "static", 'mode: "ssg"'], ["spa", "client", 'mode: "spa"'], [undefined, "client", "default"]]) {
      const { routes } = await resolveApp(files, { "about/_config.js": { render: "static" } }, { mode });
      expect(routes[0]).toEqual({ route: "/", folder: "", file: at("page.jsx"), render, data: render === "client" ? "server" : null, from });
      expect(routes[1].render).toBe("static");
    }
  });

  test("the app default is set in one place", async () => {
    await expect(resolveApp(SITE, SITE_CONFIG, { mode: "ssr" })).rejects.toThrow("The app default is set twice");
    // A root config without render leaves the default to mode.
    const { defaultRender } = await resolveApp({ "_config.js": "", "page.jsx": "" }, { "_config.js": { data: "client" } }, { mode: "spa" });
    expect(defaultRender).toBe("client");
  });

  test("a key is an error outside the strategy it belongs to", async () => {
    await expect(resolveApp({ "page.jsx": "", "_config.js": "" }, { "_config.js": { render: "server", paths: true } }))
      .rejects.toThrow('`paths` lists the pages a static route builds, but this folder renders "server"');
    await expect(resolveApp({ "page.jsx": "", "a/_config.js": "", "a/page.jsx": "" }, { "a/_config.js": { data: "client" } }, { mode: "ssr" }))
      .rejects.toThrow("`data` applies to client routes");
    // paths inherits static from above.
    const ok = await resolveApp({ "_config.js": "", "[slug]/_config.js": "", "[slug]/page.jsx": "" },
      { "_config.js": { render: "static" }, "[slug]/_config.js": { paths: true } });
    expect(ok.routes[0].render).toBe("static");
  });

  test("one config file per folder, and configs that govern no page are reported", async () => {
    await expect(resolveApp({ "_config.js": "", "_config.ts": "", "page.jsx": "" }, {})).rejects.toThrow("Two config files for one folder");
    const { warnings } = await resolveApp({ "page.jsx": "", "drafts/_config.js": "", "drafts/notes.md": "" }, { "drafts/_config.js": { render: "static" } });
    expect(warnings).toEqual([`${at("drafts/_config.js")} governs no page: there is no page.* in its folder or below it.`]);
  });

  test("excluded subtrees keep their configs out", async () => {
    const { routes } = await resolveApp({ "page.jsx": "", "skip/_config.js": "" }, { "skip/_config.js": new Error("must not be read") }, { exclude: ["skip"] });
    expect(routes.map((r) => r.route)).toEqual(["/"]);
  });

  test("a config the compiler rejects stops the build with its diagnostic", async () => {
    await expect(resolveApp({ "page.jsx": "", "_config.js": "" }, { "_config.js": new Error("app/_config.js:1:26: `render` must be a string literal") }))
      .rejects.toThrow("must be a string literal");
  });

  test("route groups are not part of a route", () => {
    expect(folderRoute("")).toBe("/");
    expect(folderRoute("(legal)/privacy")).toBe("/privacy");
    expect(folderRoute("(shop)/(deep)/cart/[id]")).toBe("/cart/[id]");
  });

  test("the route table and the manifest say what each route resolved to, and why", async () => {
    const resolved = await resolveApp(SITE, { ...SITE_CONFIG, "admin/_config.ts": { render: "client", data: "client" } });
    const table = formatRouteTable(resolved.routes, ROOT).split("\n");
    expect(table[0]).toMatch(/^Route\s+Render\s+From$/);
    expect(table).toContain("/admin/editor      client (data: client)  app/admin/_config.ts");
    expect(table.some((l) => /^\/privacy\s+static\s+app\/\(legal\)\/_config\.js$/.test(l))).toBe(true);
    const manifest = routeManifest(resolved, ROOT);
    expect(manifest.version).toBe(1);
    expect(manifest.default).toBe("server");
    expect(manifest.routes[1]).toEqual({ route: "/admin", render: "client", data: "client", page: "app/admin/page.jsx", from: "app/admin/_config.ts" });
    expect(manifest.routes[0]).toEqual({ route: "/", render: "server", page: "app/page.jsx", from: "app/_config.js" });
  });
});
