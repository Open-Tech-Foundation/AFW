// The Node host for `@opentf/afw-build` (see its host.js): file access, processes and
// paths through Node's builtins, with paths normalised to `/` separators.

import { spawn as spawnChild } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";

const slash = (p) => p.replaceAll("\\", "/");

export const nodeHost = {
  readText: (file) => readFile(file, "utf8"),
  async readDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isFile: e.isFile(), isDir: e.isDirectory(), isSymlink: e.isSymbolicLink() }));
  },
  async kind(file) {
    try {
      const s = await stat(file);
      return s.isDirectory() ? "dir" : s.isFile() ? "file" : null;
    } catch {
      return null;
    }
  },
  async spawn(program, args) {
    const child = spawnChild(program, args, { stdio: ["pipe", "pipe", "inherit"] });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    return {
      stdin: Writable.toWeb(child.stdin),
      stdout: Readable.toWeb(child.stdout),
      kill: () => child.kill(),
      ref() {
        child.ref();
        child.stdout.ref?.();
        child.stdin.ref?.();
      },
      unref() {
        child.unref();
        child.stdout.unref?.();
        child.stdin.unref?.();
      },
    };
  },
  run(program, args, { cwd, inherit = false } = {}) {
    return new Promise((resolve) => {
      const child = spawnChild(program, args, { cwd, stdio: inherit ? "inherit" : "ignore" });
      child.once("error", () => resolve({ ok: false, code: null }));
      child.once("close", (code) => resolve({ ok: code === 0, code }));
    });
  },
  cwd: () => slash(process.cwd()),
  env: process.env,
  path: {
    join: (...parts) => slash(path.join(...parts)),
    dirname: (p) => slash(path.dirname(p)),
    resolve: (...parts) => slash(path.resolve(...parts)),
  },
};
