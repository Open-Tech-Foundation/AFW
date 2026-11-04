// Output parity for the full-stack benchmark: every framework's production server must
// answer the same routes with the same content before any of its numbers count.
//
//   node benchmarks/fullstack/parity.mjs <origin> <K>

import { products } from "./spec.mjs";

const html = { accept: "text/html" };
const text = async (res) => (await res.text()).replace(/<!--[^>]*-->/g, "");

export async function checkParity(origin, k) {
  const failures = [];
  const check = (ok, label) => { if (!ok) failures.push(label); };
  const get = (path, init = {}) => fetch(`${origin}${path}`, { redirect: "manual", ...init, headers: { ...html, ...init.headers } });
  const product = products()[6];

  const home = await text(await get("/"));
  check(/Store/.test(home), "home: heading");
  check(/Count:/.test(home), "home: counter");
  check(home.includes(products()[0].name), "home: featured products from the loader");

  const page = await get(`/products/${product.id}`);
  const pageText = await text(page);
  check(page.status === 200, `product: 200 (got ${page.status})`);
  check(pageText.includes(product.name) && pageText.includes(String(product.price)), "product: server-rendered name and price");
  check((await get("/products/999")).status === 404, "product: unknown id is 404");

  const list = await fetch(`${origin}/api/products`);
  check(list.ok && (await list.json()).length === 50, "api: GET /api/products returns 50 products");
  const cart = await fetch(`${origin}/api/cart`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ id: 1 }) });
  check(cart.ok && typeof (await cart.json()).count === "number", "api: POST /api/cart returns a count");

  const guarded = await get("/account");
  check(guarded.status >= 300 && guarded.status < 400 && new URL(guarded.headers.get("location") ?? "", origin).pathname === "/", `middleware: /account redirects without the cookie (got ${guarded.status})`);
  const allowed = await get("/account", { headers: { cookie: "user=1" } });
  check(allowed.status === 200 && /Account/.test(await text(allowed)), "middleware: /account with the cookie");

  const doc = await text(await get("/docs/getting-started"));
  check(/Getting Started section 1/.test(doc) && /<table/.test(doc), "docs: MDX page with its table");

  const last = await text(await get(`/pages/p${k}`));
  check(new RegExp(`Page ${k}\\b`).test(last), `pages: the ${k}th generated page`);

  // The stylesheet the home page links has the Tailwind classes it uses.
  const css = [...home.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
  let styles = "";
  for (const href of css) styles += await (await fetch(new URL(href, origin))).text();
  check(/bg-sky-600/.test(styles), "styles: Tailwind classes in the linked CSS");

  return failures;
}

if (process.argv[1]?.endsWith("parity.mjs")) {
  const [origin, k] = process.argv.slice(2);
  const failures = await checkParity(origin, Number(k));
  console.log(failures.length ? `✗ ${failures.join("\n✗ ")}` : "✓ parity");
  process.exit(failures.length ? 1 : 0);
}
