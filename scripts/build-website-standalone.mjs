#!/usr/bin/env esdev

// Build the website from the repo root (the esdev module jail is the process
// cwd, so the site's workspace-linked plugins must load from this tree) and
// copy the dist/ output for the Cloudflare deploy.

import { copy, mkdir, remove } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { env } from "runtime:process";
import { Command } from "runtime:system";

const root = dirname(dirname(fromFileURL(import.meta.url)));
const website = join(root, "website");
const outDir = join(website, "dist");

async function run(program, args) {
  console.log(`$ ${program} ${args.join(" ")}`);
  const out = await new Command(program, {
    args,
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (out.stdout) console.log(out.stdout);
  if (out.stderr) console.error(out.stderr);
  if (!out.success) throw new Error(`${program} ${args.join(" ")} failed with exit code ${out.code}`);
}

try {
  await run("esdev", ["build", "--minify", "--config=website/esdev.json"]);
  console.log(`Website dist/ refreshed at ${outDir}`);
} finally {
  if (env.AFW_KEEP_STANDALONE_BUILD) console.log("kept in place");
}
