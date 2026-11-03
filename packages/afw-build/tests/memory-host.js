// An in-memory BuildHost for tests: a file tree from a `{ path: contents }` map and
// a scriptable `spawn`. Proves the core needs nothing beyond the host interface.

const norm = (p) => p.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
const join = (...parts) => norm(parts.filter(Boolean).join("/"));
const dirname = (p) => (p === "/" ? "/" : norm(p).replace(/\/[^/]*$/, "") || "/");
const resolve = (...parts) => {
  let out = "";
  for (const p of parts) out = p.startsWith("/") ? p : join(out, p);
  const segs = [];
  for (const s of out.split("/")) {
    if (s === "..") segs.pop();
    else if (s && s !== ".") segs.push(s);
  }
  return `/${segs.join("/")}`;
};

export function memoryHost(files = {}, { cwd = "/", env = {}, spawn, run } = {}) {
  const tree = new Map(Object.entries(files).map(([p, c]) => [norm(p), c]));
  const isDir = (p) => {
    const prefix = p === "/" ? "/" : `${p}/`;
    return [...tree.keys()].some((k) => k.startsWith(prefix));
  };
  return {
    files: tree,
    async readText(path) {
      if (!tree.has(norm(path))) throw new Error(`ENOENT ${path}`);
      return tree.get(norm(path));
    },
    async readDir(path) {
      const dir = norm(path);
      if (!isDir(dir)) throw new Error(`ENOENT ${path}`);
      const prefix = dir === "/" ? "/" : `${dir}/`;
      const names = new Map();
      for (const key of tree.keys()) {
        if (!key.startsWith(prefix)) continue;
        const [head, ...rest] = key.slice(prefix.length).split("/");
        names.set(head, rest.length > 0 || names.get(head) === true);
      }
      return [...names].map(([name, dirish]) => ({ name, isDir: dirish, isFile: !dirish, isSymlink: false }));
    },
    async kind(path) {
      const p = norm(path);
      return tree.has(p) ? "file" : isDir(p) ? "dir" : null;
    },
    spawn: spawn ?? (async () => { throw new Error("spawn not scripted"); }),
    run: run ?? (async () => ({ ok: false, code: null })),
    cwd: () => cwd,
    env,
    path: { join, dirname, resolve },
  };
}
