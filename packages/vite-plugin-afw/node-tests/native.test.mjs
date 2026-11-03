// The point of the Vite + Node workflow: server code can use native addons. A route
// resizes an image with sharp (libvips) in the dev server and in the built Node server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import sharp from "sharp";
import { createBuilder, createServer } from "vite";

import afw from "@opentf/vite-plugin-afw";
import { copyFixture } from "./helpers.mjs";

const quiet = { logLevel: "silent", configFile: false };

async function resizeThrough(origin) {
  const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#f80" } }).png().toBuffer();
  const res = await fetch(`${origin}/api/thumbnail?width=16`, { method: "POST", body: png });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 16, 8]);
}

test("a sharp route runs in the dev server", async () => {
  const { dir, cleanup } = await copyFixture("native");
  const server = await createServer({ ...quiet, root: dir, plugins: [afw()], server: { port: 0, host: "127.0.0.1" } });
  try {
    await server.listen();
    await resizeThrough(server.resolvedUrls.local[0].replace(/\/$/, ""));
  } finally {
    await server.close();
    await cleanup();
  }
});

test("a sharp route runs in the built Node server, loaded from node_modules", async () => {
  const { dir, cleanup } = await copyFixture("native");
  let child;
  try {
    await (await createBuilder({ ...quiet, root: dir, plugins: [afw()] })).buildApp();
    const serverDir = join(dir, "dist", "server");
    const files = await readdir(serverDir, { recursive: true });
    const code = (await Promise.all(files.filter((f) => f.endsWith(".js")).map((f) => readFile(join(serverDir, f), "utf8")))).join("\n");
    assert.match(code, /from\s*["']sharp["']/, "sharp stays an external import of the server bundle");
    child = spawn(process.execPath, ["dist/server/index.js"], { cwd: dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
    const origin = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (c) => { out += c; const m = out.match(/listening on (http:\/\/\S+)/); if (m) resolve(m[1]); });
      child.stderr.on("data", (c) => { out += c; });
      child.once("exit", (code) => reject(new Error(`server exited (${code}): ${out}`)));
    });
    await resizeThrough(origin);
  } finally {
    child?.kill();
    await cleanup();
  }
});
