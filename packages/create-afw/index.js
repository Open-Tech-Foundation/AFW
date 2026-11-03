#!/usr/bin/env node
// `npm create @opentf/afw` — scaffold an AFW app on Vite and Node.
//
//   npm create @opentf/afw my-app
//   npm create @opentf/afw my-app -- --template=fullstack --language=ts
//
// For the esdev + ES-Runtime workflow, use `esdev create` instead.

import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { TEMPLATES, projectFiles } from "./templates.js";
import { afwVersions } from "./versions.js";

const HELP = `Create an AFW app on Vite and Node.

Usage: npm create @opentf/afw [directory] -- [options]

Options:
  --template=<name>   ${Object.keys(TEMPLATES).join(" | ")} (default: spa)
${Object.entries(TEMPLATES).map(([n, d]) => `                        ${n.padEnd(10)} ${d}`).join("\n")}
  --language=<lang>   js | ts (default: ts)
  --yes, -y           Use the defaults instead of asking
  --help, -h          Show this help

For the esdev + ES-Runtime workflow, use \`esdev create\`.`;

const VALID_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export function parseArgs(argv) {
  const options = { directory: undefined, template: undefined, language: undefined, yes: false, help: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg.startsWith("--template=")) options.template = arg.slice(11);
    else if (arg.startsWith("--language=")) options.language = arg.slice(11);
    else if (arg === "--ts" || arg === "--typescript") options.language = "ts";
    else if (arg === "--js") options.language = "js";
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (options.directory === undefined) options.directory = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (options.template !== undefined && !TEMPLATES[options.template]) {
    throw new Error(`Unknown template "${options.template}". Choose one of: ${Object.keys(TEMPLATES).join(", ")}`);
  }
  if (options.language !== undefined && !["js", "ts"].includes(options.language)) {
    throw new Error(`Unknown language "${options.language}". Choose js or ts.`);
  }
  return options;
}

/** The package manager that ran us (`npm create`, `pnpm create`, …). */
export function packageManager(userAgent = process.env.npm_config_user_agent ?? "") {
  const name = userAgent.split("/")[0];
  return ["pnpm", "yarn", "bun"].includes(name) ? name : "npm";
}

async function isEmptyDir(dir) {
  try {
    return (await readdir(dir)).filter((f) => f !== ".git").length === 0;
  } catch {
    return true;
  }
}

async function ask(rl, question, fallback) {
  const answer = (await rl.question(`${question} (${fallback}): `)).trim();
  return answer || fallback;
}

async function choose(rl, question, choices, fallback) {
  const keys = Object.keys(choices);
  stdout.write(`${question}\n${keys.map((k, i) => `  ${i + 1}. ${k.padEnd(10)} ${choices[k]}`).join("\n")}\n`);
  for (;;) {
    const answer = (await rl.question(`Choose 1-${keys.length} (${fallback}): `)).trim();
    if (!answer) return fallback;
    const picked = keys[Number(answer) - 1] ?? (choices[answer] ? answer : undefined);
    if (picked) return picked;
  }
}

/** Scaffold a project. Returns the directory and the files written. */
export async function create({ directory, template = "spa", language = "ts", cwd = process.cwd() }) {
  const target = resolve(cwd, directory);
  const name = basename(target);
  if (!VALID_NAME.test(name)) throw new Error(`"${name}" is not a valid package name: use lowercase letters, digits, "-", "_" or ".".`);
  if (!(await isEmptyDir(target))) throw new Error(`${target} is not empty.`);
  const files = projectFiles({ name, template, typescript: language === "ts", versions: await afwVersions() });
  for (const [path, contents] of Object.entries(files)) {
    const file = join(target, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return { target, files: Object.keys(files) };
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }
  const interactive = stdin.isTTY && stdout.isTTY && !options.yes;
  if (interactive && (!options.directory || !options.template || !options.language)) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      options.directory ??= await ask(rl, "Project name", "afw-app");
      options.template ??= await choose(rl, "Template:", TEMPLATES, "spa");
      options.language ??= await choose(rl, "Language:", { ts: "TypeScript", js: "JavaScript" }, "ts");
    } finally {
      rl.close();
    }
  }
  options.directory ??= "afw-app";
  const { target } = await create(options);
  const pm = packageManager();
  const run = (script) => (pm === "npm" ? `npm run ${script}` : `${pm} ${script}`);
  const dir = relative(process.cwd(), target) || ".";
  console.log(`\nCreated ${options.template ?? "spa"} app in ${dir}\n\nNext:\n${dir === "." ? "" : `  cd ${dir}\n`}  ${pm} install\n  ${run("dev")}\n`);
}

// Run as a CLI (not when imported by the tests).
const invoked = process.argv[1] && (await access(process.argv[1]).then(() => true, () => false))
  ? (await import("node:fs")).realpathSync(process.argv[1]) === (await import("node:url")).fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
