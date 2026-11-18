// Headless Chromium for the afw-docs browser suites. Each run gets its own profile, so
// suites running at once (`tsr test-e2e`) never attach to one another's browser, and a
// port the OS picks (`--remote-debugging-port=0`), so two suites never collide on one.
// They used to share the default profile and a random port in 9000–9999, which failed
// now and then within a second ("eval: Uncaught").

import { makeTempDir, mkdir, remove } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { Command } from "runtime:system";

const ROOT = join(dirname(fromFileURL(import.meta.url)), "../../../..");

/** Start Chromium; resolves once DevTools listens, to `{ port, kill() }`. */
export async function launchChrome(binary, extraArgs = []) {
  await mkdir(join(ROOT, ".cache"), { recursive: true });
  const profile = await makeTempDir({ dir: join(ROOT, ".cache"), prefix: "e2e-chrome-" });
  const child = new Command(binary, {
    args: ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-sandbox", "--disable-gpu", ...extraArgs, "about:blank"],
    stdout: "null",
    stderr: "piped",
  }).spawn();
  const browser = await child;
  // "DevTools listening on ws://127.0.0.1:<port>/devtools/browser/…" names the port.
  const reader = browser.stderr.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  let port = null;
  while (port === null) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`Chromium exited before DevTools started:\n${text}`);
    text += value;
    const match = /DevTools listening on ws:\/\/[^\s:]+:(\d+)\//.exec(text);
    if (match) port = Number(match[1]);
  }
  // Keep reading, so a chatty browser never fills the pipe and stalls.
  (async () => {
    try {
      while (!(await reader.read()).done);
    } catch {}
  })();
  return {
    port,
    async kill() {
      try {
        browser.kill();
        await browser.status;
      } catch {}
      // Chromium may still be writing its profile as it exits: retry the removal briefly.
      for (let i = 0; i < 10; i++) {
        try {
          await remove(profile, { recursive: true });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    },
  };
}
