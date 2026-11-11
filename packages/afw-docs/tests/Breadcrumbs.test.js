// <Breadcrumbs>: the visible trail, and its BreadcrumbList JSON-LD for search engines.
// Google requires `item` (a URL) on every ListItem, so a sidebar group without its
// own page is shown in the trail but left out of the structured data.
import { afterEach, expect, test } from "runtime:test";
import { setRouteState } from "@opentf/afw";

import Breadcrumbs from "../components/Breadcrumbs.jsx";

const NAV = [
  { title: "Introduction", path: "/docs" },
  {
    title: "Core Concepts",
    items: [
      { title: "Context", path: "/docs/core-concepts/context" },
      { title: "Routing", path: "/docs/core-concepts/routing", items: [{ title: "Links", path: "/docs/core-concepts/routing/links" }] },
    ],
  },
];
const tick = () => new Promise((r) => setTimeout(r, 0));
let host;

async function mount(pathname, siteUrl = "https://docs.example/") {
  setRouteState({ pathname });
  host = document.createElement(Breadcrumbs.tag);
  host.nav = NAV;
  host.siteUrl = siteUrl;
  document.body.appendChild(host);
  await tick();
  const script = host.querySelector('script[type="application/ld+json"]');
  return {
    crumbs: Array.from(host.querySelectorAll(".afwd-crumb-link, .afwd-crumb-text")).map((el) => el.textContent),
    jsonLd: script ? JSON.parse(script.textContent) : null,
  };
}
afterEach(() => host?.remove());

test("a group without a page stays in the trail but not in the structured data", async () => {
  const { crumbs, jsonLd } = await mount("/docs/core-concepts/context");
  expect(crumbs).toEqual(["Core Concepts", "Context"]);
  expect(jsonLd["@type"]).toBe("BreadcrumbList");
  expect(jsonLd.itemListElement).toEqual([
    { "@type": "ListItem", position: 1, name: "Context", item: "https://docs.example/docs/core-concepts/context" },
  ]);
});

test("every listed crumb has an item, numbered from 1 in order", async () => {
  const { crumbs, jsonLd } = await mount("/docs/core-concepts/routing/links");
  expect(crumbs).toEqual(["Core Concepts", "Routing", "Links"]);
  expect(jsonLd.itemListElement).toEqual([
    { "@type": "ListItem", position: 1, name: "Routing", item: "https://docs.example/docs/core-concepts/routing" },
    { "@type": "ListItem", position: 2, name: "Links", item: "https://docs.example/docs/core-concepts/routing/links" },
  ]);
});

test("without a site URL the items are route paths", async () => {
  const { jsonLd } = await mount("/docs", "");
  expect(jsonLd.itemListElement).toEqual([{ "@type": "ListItem", position: 1, name: "Introduction", item: "/docs" }]);
});

test("a page outside the nav gets no structured data", async () => {
  const { crumbs, jsonLd } = await mount("/elsewhere");
  expect(crumbs).toEqual([]);
  expect(jsonLd).toBe(null);
});
