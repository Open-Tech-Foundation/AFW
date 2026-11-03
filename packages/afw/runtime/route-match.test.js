import { describe, expect, test } from "runtime:test";

import { compareRoutes, compileRoute, compileScope, decodeParams, stripAppDir } from "./route-match.js";

describe("compareRoutes", () => {
  const rank = (...routes) => [...routes].sort(compareRoutes);

  test("a static segment beats a param, which beats a catch-all", () => {
    expect(rank("/blog/[...rest]", "/blog/[slug]", "/blog/new")).toEqual([
      "/blog/new", "/blog/[slug]", "/blog/[...rest]",
    ]);
  });

  test("ranking ignores param name length", () => {
    expect(rank("/api/[...r]", "/api/[identifier]")).toEqual(["/api/[identifier]", "/api/[...r]"]);
    expect(rank("/api/[...everything]", "/api/[id]")).toEqual(["/api/[id]", "/api/[...everything]"]);
  });

  test("the first differing segment decides, before route length", () => {
    expect(rank("/[lang]/docs/intro", "/blog/[slug]")).toEqual(["/blog/[slug]", "/[lang]/docs/intro"]);
    expect(rank("/docs/[...rest]", "/docs/a/[id]")).toEqual(["/docs/a/[id]", "/docs/[...rest]"]);
  });

  test("equal kinds: more segments first, then a lexical tie-break", () => {
    expect(rank("/a", "/a/b")).toEqual(["/a/b", "/a"]);
    expect(rank("/b", "/a", "/")).toEqual(["/a", "/b", "/"]);
  });
});

describe("compileRoute", () => {
  test("matches params, catch-alls and an optional trailing slash", () => {
    expect("/users/7".match(compileRoute("/users/[id]")).groups).toEqual({ id: "7" });
    expect("/docs/a/b".match(compileRoute("/docs/[...rest]")).groups).toEqual({ rest: "a/b" });
    expect(compileRoute("/users/[id]").test("/users/7/")).toBe(true);
    expect(compileRoute("/users/[id]").test("/users/7/edit")).toBe(false);
  });

  test("escapes literal regex characters", () => {
    expect(compileRoute("/v1.0").test("/v1X0")).toBe(false);
    expect(compileRoute("/v1.0").test("/v1.0")).toBe(true);
  });
});

describe("compileScope", () => {
  test("covers the folder and everything nested under it", () => {
    const s = compileScope("/admin");
    expect(s.test("/admin")).toBe(true);
    expect(s.test("/admin/users")).toBe(true);
    expect(s.test("/administrator")).toBe(false);
  });

  test("dynamic folder scopes match concrete paths", () => {
    const s = compileScope("/users/[id]");
    expect(s.test("/users/7")).toBe(true);
    expect(s.test("/users/7/edit")).toBe(true);
    expect(s.test("/users")).toBe(false);
    expect(compileScope("/docs/[...rest]").test("/docs/a/b")).toBe(true);
  });

  test("the root scope covers every path", () => {
    expect(compileScope("/").test("/")).toBe(true);
    expect(compileScope("/").test("/anything/at/all")).toBe(true);
  });
});

describe("decodeParams", () => {
  test("percent-decodes params and splits catch-alls before decoding", () => {
    expect(decodeParams("/u/[name]", { name: "John%20Doe" })).toEqual({ name: "John Doe" });
    expect(decodeParams("/f/[...path]", { path: "a%2Fb/c" })).toEqual({ path: ["a/b", "c"] });
  });

  test("malformed encoding stays raw, or fails the match when strict", () => {
    expect(decodeParams("/u/[name]", { name: "%E0%A4%A" })).toEqual({ name: "%E0%A4%A" });
    expect(decodeParams("/u/[name]", { name: "%E0%A4%A" }, { strict: true })).toBe(null);
  });
});

describe("stripAppDir", () => {
  test("strips the exact app dir, else the last /app segment", () => {
    expect(stripAppDir("/root/app/app/x/route.js", "/root/app")).toBe("/app/x/route.js");
    expect(stripAppDir("/root/app/appointments/route.js")).toBe("/appointments/route.js");
  });
});
