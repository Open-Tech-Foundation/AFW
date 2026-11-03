// The ES-Runtime host for `@opentf/afw-build` (see its host.js): file access,
// processes and paths through `runtime:*` modules — no `node:` builtins.

import { file, readDir, stat } from "runtime:fs";
import { dirname, join, resolve } from "runtime:path";
import { cwd, env } from "runtime:process";
import { Command } from "runtime:system";

export const esdevHost = {
  readText: (path) => file(path).text(),
  readDir: (path) => readDir(path),
  async kind(path) {
    try {
      const s = await stat(path);
      return s.isDir ? "dir" : s.isFile ? "file" : null;
    } catch {
      return null;
    }
  },
  async spawn(program, args) {
    const proc = await new Command(program, { args, stdin: "piped", stdout: "piped", stderr: "inherit" }).spawn();
    return { stdin: proc.stdin, stdout: proc.stdout, kill: () => proc.kill() };
  },
  async run(program, args, { cwd: dir, inherit = false } = {}) {
    const stdio = inherit ? "inherit" : "piped";
    try {
      const out = await new Command(program, { args, cwd: dir, stdout: stdio, stderr: stdio, inheritEnv: true }).output();
      return { ok: out.success, code: out.code };
    } catch {
      return { ok: false, code: null };
    }
  },
  cwd: () => cwd(),
  env,
  path: { join, dirname, resolve },
};
