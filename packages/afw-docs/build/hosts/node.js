// The Node host for the docs build (installed by `@opentf/afw-docs/vite`).
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afwcPath } from "@opentf/afw-compiler/node";

const slash = (p) => p.replaceAll("\\", "/");

function exec(program, args, { cwd } = {}) {
  return new Promise((resolve) => {
    execFile(program, args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

export const nodeHost = {
  readText: (file) => readFile(file, "utf8"),
  async readDir(dir) {
    return (await readdir(dir, { withFileTypes: true })).map((e) => ({ name: e.name, isFile: e.isFile(), isDir: e.isDirectory() }));
  },
  async writeText(file, text) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  },
  async kind(file) {
    try {
      const s = await stat(file);
      return s.isDirectory() ? "dir" : s.isFile() ? "file" : null;
    } catch {
      return null;
    }
  },
  exec,
  async output(program, args, options) {
    const out = await exec(program, args, options);
    return out.ok ? out.stdout.trim() : null;
  },
  cwd: () => slash(process.cwd()),
  afwcPath: () => afwcPath(),
  path: {
    join: (...parts) => slash(path.join(...parts)),
    dirname: (p) => slash(path.dirname(p)),
    relative: (from, to) => slash(path.relative(from, to)),
    resolve: (...parts) => slash(path.resolve(...parts)),
    toFileUrl: (p) => pathToFileURL(p).href,
  },
};
