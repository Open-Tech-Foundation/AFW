// The ES-Runtime host for the docs build (installed by `@opentf/afw-docs/build`).
import { exists as fsExists, file, mkdir, readDir, stat, write } from "runtime:fs";
import { dirname, join, relative, resolve, toFileURL } from "runtime:path";
import { cwd } from "runtime:process";
import { Command } from "runtime:system";

import { afwcPath } from "@opentf/afw-compiler";

async function exec(program, args, { cwd: dir } = {}) {
  const out = await new Command(program, { args, cwd: dir, stdout: "piped", stderr: "piped", inheritEnv: true }).output();
  const text = (bytes) => new TextDecoder().decode(bytes);
  return { ok: out.success, stdout: text(out.stdout), stderr: text(out.stderr) };
}

export const esdevHost = {
  readText: (path) => file(path).text(),
  readDir: (path) => readDir(path),
  async writeText(path, text) {
    await mkdir(dirname(path), { recursive: true });
    await write(path, text);
  },
  async kind(path) {
    if (!(await fsExists(path))) return null;
    const s = await stat(path);
    return s.isDir ? "dir" : s.isFile ? "file" : null;
  },
  exec,
  async output(program, args, options) {
    const out = await exec(program, args, options);
    return out.ok ? out.stdout.trim() : null;
  },
  cwd: () => cwd(),
  afwcPath: () => afwcPath(),
  path: { join, dirname, relative, resolve, toFileUrl: (path) => toFileURL(path).href },
};
