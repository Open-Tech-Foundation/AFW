// The docs components' nav lookups: the section for a path, a node by its position id, and
// the link count that decides whether every top-level group starts open.
import { describe, expect, test } from "runtime:test";

import { EXPAND_ALL_LIMIT, countLinks, nodeAt, pickSection, sectionTree } from "../components/nav-source.js";

const DOCS = [
  { title: "Intro", path: "/docs" },
  { title: "Guide", items: [{ title: "Setup", path: "/docs/guide/setup" }, { title: "Deep", items: [{ title: "Leaf", path: "/docs/guide/deep/leaf" }] }] },
];
const API = [{ title: "Reference", path: "/api" }];
const MAP = { "/docs": DOCS, "/api": API, "/": [{ title: "Home", path: "/" }] };

describe("pickSection", () => {
  test("the longest base that prefixes the path wins", () => {
    expect(pickSection(MAP, "/docs/guide/setup")).toBe(DOCS);
    expect(pickSection(MAP, "/api")).toBe(API);
    expect(pickSection(MAP, "/blog/post")).toBe(MAP["/"]);
  });

  test("a base matches whole segments only", () => {
    expect(pickSection({ "/docs": DOCS, "/": API }, "/docsearch")).toBe(API);
  });

  test("a bare array is one section; an empty map is an empty tree", () => {
    expect(pickSection(DOCS, "/anything")).toBe(DOCS);
    expect(pickSection({}, "/docs")).toEqual([]);
  });

  test("sectionTree prefers a given tree", () => {
    expect(sectionTree(API, "/docs")).toBe(API);
  });
});

describe("nodeAt", () => {
  test("finds a node by its position id", () => {
    expect(nodeAt(DOCS, "0").title).toBe("Intro");
    expect(nodeAt(DOCS, "1-1-0").title).toBe("Leaf");
  });

  test("a position past the tree is undefined", () => {
    expect(nodeAt(DOCS, "5")).toBe(undefined);
    expect(nodeAt(DOCS, "0-3")).toBe(undefined);
    expect(nodeAt(undefined, "0")).toBe(undefined);
  });
});

describe("countLinks", () => {
  test("counts every path in the tree, nested ones included", () => {
    expect(countLinks(DOCS)).toBe(3);
    expect(countLinks([])).toBe(0);
    expect(countLinks(undefined)).toBe(0);
  });

  test("a tree past the limit is large", () => {
    const big = [{ title: "All", items: Array.from({ length: EXPAND_ALL_LIMIT + 1 }, (_, i) => ({ title: `${i}`, path: `/p/${i}` })) }];
    expect(countLinks(big) > EXPAND_ALL_LIMIT).toBe(true);
  });
});
