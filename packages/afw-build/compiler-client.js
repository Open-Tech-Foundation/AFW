// The `afwc serve` protocol client, shared by every toolchain integration.
//
// One long-lived compiler child serves every module of every build in the process;
// requests and replies are framed over its stdin/stdout. Starting the child is the
// only platform-specific step, so it comes from the host's `spawn` (see host.js).

/**
 * Turn an `ERR` reply payload into an `Error` carrying the compiler's diagnostic.
 * The payload is the JSON object `Diag::json` writes — `{ file, message, line,
 * column, frame, note }` — so the position survives as data all the way to the browser
 * overlay instead of being flattened into prose. An older compiler (or a protocol
 * error) sends a bare string; that still works, it just has no position.
 *
 * `error.message` is the one-line human form (`path:line:col message`), `error.diag`
 * the structured fields, and `error.text` the full terminal rendering with the frame.
 */
export function compileError(payload) {
  let d = null;
  if (payload.startsWith("{")) {
    try {
      d = JSON.parse(payload);
    } catch {}
  }
  if (!d?.message) {
    const err = new Error(payload);
    err.diag = { message: payload };
    err.text = payload;
    return err;
  }
  const where = d.line ? `${d.file}:${d.line}:${d.column}` : d.file;
  const err = new Error(`${where}: ${d.message}`);
  err.diag = d;
  err.text =
    `${where}: ${d.message}\n` + (d.note ? `note: ${d.note}\n` : "") + (d.frame ? `\n${d.frame}` : "");
  return err;
}

/**
 * Start a long-lived `afwc serve` process and talk to it over a framed
 * stdin/stdout protocol (see crates/afw_cli/src/main.rs `serve`). One process
 * compiles every module, so the toolchain pays the binary-startup cost once
 * instead of spawning a subprocess per file — the dominant dev-server cost.
 *
 * `compile(id, source, component, target)` resolves to the emitted JS or rejects
 * with the compiler diagnostic (`target` is `"csr"` | `"ssg"` | `"hydrate"`).
 * With `{ sourceMap: true }`, success resolves to `{ code, map }`. Older
 * binaries still compile, returning `map: null`. The request framing is unchanged.
 * Requests are serialized through a FIFO queue: the server
 * is single-threaded, replies arrive in request order, so the head of the queue
 * always pairs with the next frame. The child is killed when this process exits.
 */
// Every compiler child started in this process, so a one-shot command can shut them
// all down. It has to: an open reader on a child's stdout keeps the runtime alive, so
// a prerender step that simply returned would hang after its output is written.
const compilers = new Set();

/** Stop every `afwc serve` child. Called at the end of the one-shot commands. */
export async function closeCompilers() {
  await Promise.all([...compilers].map((close) => close()));
  compilers.clear();
}

export function startCompilerServer(afwc, { sourceMap = false, spawn } = {}) {
  if (typeof spawn !== "function") throw new TypeError("startCompilerServer: a host `spawn` function is required");
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const queue = []; // { resolve, reject } in request order
  let buf = new Uint8Array(0);
  let pumping = false;
  let dead = false;
  let started = null;

  const append = (a, b) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };
  const die = (err) => {
    dead = true;
    while (queue.length) queue.shift().reject(err);
    idle();
  };

  // Spawning is async here, so the child is started on the first compile rather than
  // when the plugin is constructed — a build that never touches a `.jsx` never pays
  // for it. Nothing awaits the child's exit, so it holds nothing open; when this
  // process goes, the child sees EOF on its stdin and stops.
  let reading = null; // the stdout reader, so `close` can release it
  // The child holds its parent process open only while a compile is in flight
  // (hosts that can — Node — expose `ref`/`unref`). An idle compiler must not keep a
  // build or test process alive when the toolchain never calls `close`.
  let child = null;
  const idle = () => child?.unref?.();

  function start() {
    started ??= Promise.resolve(spawn(afwc, sourceMap ? ["serve", "--sourcemap"] : ["serve"])).then((proc) => {
      reading = proc.stdout.getReader();
      child = proc;
      return { proc, writer: proc.stdin.getWriter(), reader: reading };
    });
    return started;
  }

  // Drain reply frames as they arrive, resolving queued requests in order. A frame
  // is `<status> <byteLen>\n` followed by exactly `byteLen` bytes of payload.
  async function pump(reader) {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length) {
        let nl = buf.indexOf(10);
        while (nl === -1) {
          const { value, done } = await reader.read();
          if (done) return die(new Error("afwc serve exited"));
          buf = append(buf, value);
          nl = buf.indexOf(10);
        }
        const [status, lenStr] = dec.decode(buf.subarray(0, nl)).split(" ");
        const len = Number(lenStr);
        while (buf.length < nl + 1 + len) {
          const { value, done } = await reader.read();
          if (done) return die(new Error("afwc serve exited"));
          buf = append(buf, value);
        }
        const payload = dec.decode(buf.subarray(nl + 1, nl + 1 + len));
        buf = buf.slice(nl + 1 + len);
        const job = queue.shift();
        if (status === "MAP") job.resolve(JSON.parse(payload));
        // Older packaged binaries ignore --sourcemap and return plain OK frames.
        // Keep them usable; they cannot provide mappings until upgraded.
        else if (status === "OK") job.resolve(sourceMap ? { code: payload, map: null } : payload);
        else job.reject(compileError(payload));
        if (!queue.length) idle();
      }
    } finally {
      pumping = false;
    }
  }

  // Replies are paired with requests by position, so the frames must reach the child
  // in the order their promises were queued. Writing to a `WritableStream` is async,
  // so the writes are chained rather than merely awaited per call — two concurrent
  // `compile()`s would otherwise interleave their header and payload bytes.
  let writes = Promise.resolve();

  function compile(id, source, component, target = "csr") {
    if (dead) return Promise.reject(new Error("afwc serve is not running"));
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject });
      writes = writes
        .then(async () => {
          const { proc, writer, reader } = await start();
          proc.ref?.();
          const idB = enc.encode(id);
          const srcB = enc.encode(source);
          await writer.write(enc.encode(`${idB.length} ${srcB.length} ${component ? 1 : 0} ${target}\n`));
          await writer.write(idB);
          await writer.write(srcB);
          pump(reader);
        })
        .catch(die);
    });
  }

  async function close() {
    compilers.delete(close);
    if (dead) return;
    dead = true;
    if (!started) return;
    try {
      const { proc, writer } = await started;
      try {
        await writer.close();
      } catch {}
      // Releasing the reader matters as much as killing the child: an outstanding
      // reader on a child's stdout is itself a reason for the runtime to stay up.
      try {
        await reading?.cancel();
      } catch {}
      proc.kill();
    } catch {}
  }

  compilers.add(close);
  return { compile, close };
}
