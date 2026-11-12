import { describe, expect, test } from "runtime:test";

import {
  chooseTarget, compileModule, compilerTarget, isRouteModule, resolveCompiler, startCompilerServer, usesServerEntry, validateOptions,
} from "../index.js";
import { memoryHost } from "./memory-host.js";

describe("targets", () => {
  test("server builds render strings, dev and releases follow the mode, tests render on the client", () => {
    expect(chooseTarget({ mode: "ssr", server: true })).toBe("ssg");
    // The ssr dev server renders pages first, so its browser build adopts them.
    expect(chooseTarget({ mode: "ssr", dev: true })).toBe("hydrate");
    expect(chooseTarget({ mode: "ssg", dev: true })).toBe("csr");
    expect(chooseTarget({ mode: "spa", dev: true })).toBe("csr");
    expect(chooseTarget({ mode: "ssr", test: true })).toBe("csr");
    expect(chooseTarget({ mode: "ssr", dev: true, test: true })).toBe("csr");
    expect(chooseTarget({ mode: "ssr", dev: true, target: "csr" })).toBe("csr");
    expect(chooseTarget({ mode: "spa" })).toBe("csr");
    expect(chooseTarget({ mode: "ssg" })).toBe("hydrate");
    expect(chooseTarget({ mode: "spa", target: "hydrate", server: true })).toBe("hydrate");
  });

  test("framework imports use the server entry only for string renderers", () => {
    expect(usesServerEntry({ server: true })).toBe(true);
    expect(usesServerEntry({ target: "csr", server: true })).toBe(false);
    expect(usesServerEntry({})).toBe(false);
  });

  test("unknown modes and targets fail early", () => {
    expect(() => validateOptions({ mode: "isr" })).toThrow("Unknown AFW rendering mode");
    expect(() => validateOptions({ target: "dom" })).toThrow("Unknown AFW compiler target");
  });

  test("page, layout and 404 modules are route modules", () => {
    expect(isRouteModule("/a/page.mdx")).toBe(true);
    expect(isRouteModule("C:\\a\\layout.tsx")).toBe(true);
    expect(isRouteModule("/a/Button.jsx")).toBe(false);
    expect(isRouteModule("/a/dash/loading.jsx")).toBe(true);
    expect(isRouteModule("/a/error.tsx")).toBe(true);
  });
});

describe("compileModule", () => {
  const server = (impl) => ({ compile: impl });

  test("passes the component flag and the hot target through", async () => {
    const calls = [];
    const s = server(async (...args) => (calls.push(args), { code: "js", map: { version: 3 } }));
    expect(await compileModule(s, "<p/>", "/a/Button.jsx", { target: "csr", hot: true })).toEqual({ code: "js", map: { version: 3 } });
    await compileModule(s, "", "/a/page.jsx", { target: "hydrate", hot: true });
    await compileModule(s, "", "/a/page.jsx", { target: "hydrate" });
    expect(calls.map(([, , component, target]) => [component, target])).toEqual([[true, "csr-hot"], [false, "hydrate-hot"], [false, "hydrate"]]);
  });

  test("hot selects each target's refresh build; server renderers have none", () => {
    expect(compilerTarget("csr", true)).toBe("csr-hot");
    expect(compilerTarget("hydrate", true)).toBe("hydrate-hot");
    expect(compilerTarget("ssg", true)).toBe("ssg");
    expect(compilerTarget("hydrate")).toBe("hydrate");
  });

  test("a failure becomes a stub, or throws after reporting when failOnError", async () => {
    const err = Object.assign(new Error("bad"), { text: "app/page.jsx:1:1: bad", diag: { file: "app/page.jsx", line: 1 } });
    const s = server(async () => { throw err; });
    const results = [];
    const stub = await compileModule(s, "", "/a/page.jsx", { target: "csr", onResult: (id, d) => results.push(d) });
    expect(stub.code).toContain("Compile error");
    expect(results).toEqual([{ file: "app/page.jsx", line: 1 }]);
    const reported = [];
    await expect(compileModule(s, "", "/a/page.jsx", { target: "csr", failOnError: true, error: (m) => reported.push(m) })).rejects.toThrow("bad");
    expect(reported[0]).toContain("app/page.jsx:1:1: bad");
  });
});

describe("startCompilerServer", () => {
  // A scripted `afwc serve`: replies to each request frame with an OK frame
  // echoing the target, split across chunks to exercise the framing.
  function fakeServe() {
    const enc = new TextEncoder();
    let out;
    const stdout = new ReadableStream({ start: (c) => (out = c) });
    let pending = new Uint8Array(0);
    const stdin = new WritableStream({
      write(chunk) {
        const merged = new Uint8Array(pending.length + chunk.length);
        merged.set(pending); merged.set(chunk, pending.length);
        pending = merged;
        for (;;) {
          const nl = pending.indexOf(10);
          if (nl === -1) return;
          const [idLen, srcLen, , target] = new TextDecoder().decode(pending.subarray(0, nl)).split(" ");
          const total = nl + 1 + Number(idLen) + Number(srcLen);
          if (pending.length < total) return;
          const id = new TextDecoder().decode(pending.subarray(nl + 1, nl + 1 + Number(idLen)));
          pending = pending.slice(total);
          const body = enc.encode(`${target}:${id}`);
          const frame = id.includes("bad") ? enc.encode(`ERR ${body.length}\n`) : enc.encode(`OK ${body.length}\n`);
          out.enqueue(frame.subarray(0, 2)); out.enqueue(frame.subarray(2)); out.enqueue(body);
        }
      },
    });
    return { stdin, stdout, kill() {} };
  }

  test("pairs concurrent requests with their replies over the host's child", async () => {
    let spawned = [];
    const server = startCompilerServer("/bin/afwc", { spawn: async (p, a) => (spawned.push([p, ...a]), fakeServe()) });
    const [a, b] = await Promise.all([server.compile("/x/A.jsx", "a", true, "csr"), server.compile("/x/B.jsx", "b", true, "ssg")]);
    expect([a, b]).toEqual(["csr:/x/A.jsx", "ssg:/x/B.jsx"]);
    await expect(server.compile("/x/bad.jsx", "", true, "csr")).rejects.toThrow("csr:/x/bad.jsx");
    expect(spawned).toEqual([["/bin/afwc", "serve"]]);
    await server.close();
  });

  test("requires a spawn function", () => {
    expect(() => startCompilerServer("/bin/afwc")).toThrow("spawn");
  });
});

describe("resolveCompiler", () => {
  test("AFWC_BIN, then the package, then a source checkout", async () => {
    const host = memoryHost({ "/repo/Cargo.toml": "", "/repo/crates/afw_cli/Cargo.toml": "" });
    expect(await resolveCompiler(host, { env: { AFWC_BIN: "/x/afwc" } })).toEqual({ afwc: "/x/afwc", workspace: null });
    expect(await resolveCompiler(host, { env: {}, resolvePackagedCompiler: () => "/pkg/afwc" })).toEqual({ afwc: "/pkg/afwc", workspace: null });
    const ensured = [];
    const local = await resolveCompiler(host, {
      env: {}, cliDir: "/repo/packages/vite-plugin-afw",
      resolvePackagedCompiler: () => { throw new Error("no prebuilt"); },
      ensure: (afwc, ws) => ensured.push([afwc, ws]),
    });
    expect(local).toEqual({ afwc: "/repo/target/debug/afwc", workspace: "/repo" });
    expect(ensured).toEqual([["/repo/target/debug/afwc", "/repo"]]);
  });

  test("an installed package never builds from source", async () => {
    const host = memoryHost({ "/repo/Cargo.toml": "", "/repo/crates/afw_cli/Cargo.toml": "" });
    await expect(resolveCompiler(host, {
      env: {}, cliDir: "/repo/node_modules/@opentf/vite-plugin-afw",
      resolvePackagedCompiler: () => { throw new Error("no prebuilt"); },
    })).rejects.toThrow("no prebuilt");
  });
});
