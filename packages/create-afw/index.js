#!/usr/bin/env node
// `npm create @opentf/afw` — scaffold an AFW app on Vite and Node.
//
//   npm create @opentf/afw@latest
//   npm create @opentf/afw@latest my-app -- --template app --render ssr --styling tailwind
//
// For the esdev + ES-Runtime workflow, use `esdev create` instead.

import { spawn } from "node:child_process";
import { mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { argv, cwd, env, exit, stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";

import * as prompts from "@clack/prompts";
import { slugify } from "@opentf/std";

import { RENDERINGS, SERVER_RENDERINGS, STYLINGS, TEMPLATES, projectFiles } from "./templates.js";
import { afwVersions } from "./versions.js";

const DEFAULT_DIRECTORY = "afw-app";
const LANGUAGES = { ts: "TypeScript", js: "JavaScript" };
const TEMPLATE_NAMES = Object.keys(TEMPLATES);
const SERVER_HINT = "API routes, middleware, loaders and server functions on Node";
const VALID_NAME = /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/;

const HELP = `Usage: npm create @opentf/afw [directory] -- [options]

Create an AFW project on Vite and Node. With no options, you are asked for each choice.

Options:
  -t, --template <name>   ${TEMPLATE_NAMES.join(", ")} (add -ts or -js to pick the language)
  -r, --render <mode>     app: how pages render by default: ${Object.keys(RENDERINGS).join(", ")}
      --server            app: add ${SERVER_HINT}
      --no-server         app: no server (not with --render server or mixed, which always have one)
  -s, --styling <name>    app and library: ${Object.keys(STYLINGS).join(", ")} (--tailwind for short)
      --blog              docs: add a blog, with RSS and Atom feeds
      --no-blog           docs: no blog (the default)
  -l, --language <lang>   ts or js
      --overwrite         Remove the files in a non-empty target directory first
      --no-install        Skip installing dependencies
      --no-interactive    Never ask; use the defaults for anything not given
  -h, --help              Show this help

Templates:
${TEMPLATE_NAMES.map((t) => `  ${t.padEnd(10)} ${TEMPLATES[t]}`).join("\n")}

Renderings (app), set in app/_config.js; any folder can change it with its own:
${Object.entries(RENDERINGS).map(([r, label]) => `  ${r.padEnd(10)} ${label}`).join("\n")}


For the esdev + ES-Runtime workflow, use \`esdev create\`.`;

/** Parse the command line. Throws on an unknown option or value, or conflicting ones. */
export function parseArgs(args) {
  const options = {
    directory: undefined, template: undefined, render: undefined, server: undefined, styling: undefined, blog: undefined,
    language: undefined, overwrite: false, install: true, interactive: undefined, help: false,
  };
  const value = (i, flag) => {
    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (flag === "-h" || flag === "--help") options.help = true;
    else if (flag === "-t" || flag === "--template") options.template = inline ?? value(i++, flag);
    else if (flag === "-r" || flag === "--render") options.render = inline ?? value(i++, flag);
    else if (flag === "--server") options.server = true;
    else if (flag === "--no-server") options.server = false;
    else if (flag === "-s" || flag === "--styling") options.styling = inline ?? value(i++, flag);
    else if (flag === "--tailwind") options.styling = "tailwind";
    else if (flag === "--blog") options.blog = true;
    else if (flag === "--no-blog") options.blog = false;
    else if (flag === "-l" || flag === "--language") options.language = inline ?? value(i++, flag);
    else if (flag === "--ts" || flag === "--typescript") options.language = "ts";
    else if (flag === "--js") options.language = "js";
    else if (flag === "--overwrite") options.overwrite = true;
    else if (flag === "--no-install") options.install = false;
    else if (flag === "--no-interactive" || flag === "-y" || flag === "--yes") options.interactive = false;
    else if (flag === "--interactive") options.interactive = true;
    else if (flag.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (options.directory === undefined) options.directory = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (options.template !== undefined) {
    const [, base, lang] = options.template.match(/^(.*?)(?:-(ts|js))?$/);
    if (!TEMPLATES[base]) {
      throw new Error(`Unknown template "${options.template}". Choose one of: ${TEMPLATE_NAMES.join(", ")} (optionally with -ts or -js).`);
    }
    if (lang) {
      if (options.language && options.language !== lang) throw new Error(`--template ${options.template} conflicts with --language ${options.language}`);
      options.language = lang;
    }
    options.template = base;
  }
  if (options.render !== undefined && !RENDERINGS[options.render]) {
    throw new Error(`Unknown rendering "${options.render}". Choose one of: ${Object.keys(RENDERINGS).join(", ")}.`);
  }
  if (options.styling !== undefined && !STYLINGS[options.styling]) {
    throw new Error(`Unknown styling "${options.styling}". Choose one of: ${Object.keys(STYLINGS).join(", ")}.`);
  }
  if (options.language !== undefined && !LANGUAGES[options.language]) {
    throw new Error(`Unknown language "${options.language}". Choose ts or js.`);
  }
  if (SERVER_RENDERINGS.has(options.render) && options.server === false) throw new Error(`--render ${options.render} always has a server; drop --no-server`);
  if (options.template && options.template !== "app") {
    if (options.render !== undefined) throw new Error(`--render applies to the app template, not ${options.template}`);
    if (options.server !== undefined) throw new Error(`--server applies to the app template, not ${options.template}`);
  }
  if (options.template && options.template !== "docs" && options.blog !== undefined) {
    throw new Error(`--${options.blog ? "" : "no-"}blog applies to the docs template, not ${options.template}`);
  }
  if (options.template === "docs" && options.styling !== undefined) {
    throw new Error("--styling applies to the app and library templates; the docs template uses the afw-docs theme");
  }
  return options;
}

/** The package manager that ran us (`npm create`, `pnpm create`, …). */
export function packageManager(userAgent = env.npm_config_user_agent ?? "") {
  const name = userAgent.split(" ")[0]?.split("/")[0];
  return ["pnpm", "yarn", "bun", "deno"].includes(name) ? name : "npm";
}

/** Whether `name` can be an npm package name. */
export const isValidPackageName = (name) => VALID_NAME.test(name);

/** A valid package name derived from a folder name (`My App` → `my-app`). */
export const toValidPackageName = (name) => slugify(name) || "afw-app";

async function isEmpty(dir) {
  try {
    return (await readdir(dir)).every((entry) => entry === ".git");
  } catch {
    return true;
  }
}

async function emptyDir(dir) {
  for (const entry of await readdir(dir)) {
    if (entry !== ".git") await rm(join(dir, entry), { recursive: true, force: true });
  }
}

/**
 * Scaffold a project. `existing`: what to do with a non-empty target — `"error"`
 * (default), `"remove"` its files first, or `"ignore"` and write beside them.
 */
export async function create({
  directory = DEFAULT_DIRECTORY, template = "app", render = "client", server = false, blog = false, styling = "css", language = "ts",
  packageName, existing = "error", cwd: base = cwd(),
} = {}) {
  const target = resolve(base, directory);
  const name = packageName ?? basename(target);
  if (!isValidPackageName(name)) throw new Error(`"${name}" is not a valid package name: use lowercase letters, digits, "-", "_" or ".".`);
  if (!(await isEmpty(target))) {
    if (existing === "remove") await emptyDir(target);
    else if (existing !== "ignore") throw new Error(`${target} is not empty. Use --overwrite to remove its files.`);
  }
  const files = projectFiles({ name, template, render, server, blog, styling, typescript: language === "ts", versions: await afwVersions() });
  for (const [path, contents] of Object.entries(files)) {
    const file = join(target, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return { target, name, files: Object.keys(files) };
}

/** The commands to run next, for the package manager in use. */
export function nextSteps({ directory, pm, installed = false }) {
  const run = (script) => (pm === "npm" || pm === "bun" ? `${pm} run ${script}` : `${pm} ${script}`);
  return [
    ...(directory === "." ? [] : [`cd ${/\s/.test(directory) ? JSON.stringify(directory) : directory}`]),
    ...(installed ? [] : [`${pm} install`]),
    run("dev"),
  ];
}

/** Run `pm install` in `dir`, its output shown. Resolves whether it succeeded. */
export function installDependencies(pm, dir) {
  return new Promise((done) => {
    const child = spawn(pm, ["install"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", () => done(false));
    child.once("close", (code) => done(code === 0));
  });
}

// Exit on Ctrl+C or Escape, as create-vite does.
function cancelled() {
  prompts.cancel("Operation cancelled.");
  exit(0);
}

const ask = async (prompt) => {
  const answer = await prompt;
  if (prompts.isCancel(answer)) cancelled();
  return answer;
};

export async function main(args = argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(`${styleText("red", "✖")} ${error.message}\n\nRun with --help for usage.`);
    exit(1);
  }
  if (options.help) {
    console.log(HELP);
    return;
  }
  const interactive = options.interactive ?? (stdin.isTTY && stdout.isTTY && !prompts.isCI());
  const pm = packageManager();

  prompts.intro(styleText(["bgCyan", "black"], " create-afw "));

  // Project name → target directory.
  let directory = options.directory;
  if (!directory && interactive) {
    directory = await ask(prompts.text({
      message: "Project name:",
      placeholder: DEFAULT_DIRECTORY,
      defaultValue: DEFAULT_DIRECTORY,
    }));
  }
  directory = (directory || DEFAULT_DIRECTORY).trim().replace(/\/+$/, "") || DEFAULT_DIRECTORY;
  const target = resolve(cwd(), directory);

  // A target that already has files.
  let existing = options.overwrite ? "remove" : "error";
  if (!options.overwrite && !(await isEmpty(target))) {
    if (!interactive) {
      prompts.cancel(`Target directory "${directory}" is not empty. Use --overwrite to remove its files.`);
      exit(1);
    }
    existing = await ask(prompts.select({
      message: `${directory === "." ? "Current directory" : `Target directory "${directory}"`} is not empty. How do you want to continue?`,
      options: [
        { value: "cancel", label: "Cancel" },
        { value: "remove", label: "Remove existing files and continue" },
        { value: "ignore", label: "Ignore files and continue" },
      ],
    }));
    if (existing === "cancel") cancelled();
  }

  // The package name, when the folder name cannot be one.
  let packageName = basename(target);
  if (!isValidPackageName(packageName)) {
    packageName = interactive
      ? await ask(prompts.text({
        message: "Package name:",
        defaultValue: toValidPackageName(packageName),
        placeholder: toValidPackageName(packageName),
        validate: (value) => (value === "" || isValidPackageName(value) ? undefined : "Invalid package.json name"),
      }))
      : toValidPackageName(packageName);
    packageName ||= toValidPackageName(basename(target));
  }

  const choose = (message, entries) => ask(prompts.select({
    message, options: Object.entries(entries).map(([value, hint]) => ({ value, label: value, hint })),
  }));

  const template = options.template ?? (interactive ? await choose("Select a template:", TEMPLATES) : "app");
  const isApp = template === "app";
  const render = isApp
    ? (options.render ?? (interactive ? await choose("How should pages render by default? (any folder can change it later with its own _config.js)", RENDERINGS) : "client"))
    : undefined;
  // Server-rendered pages need a server; the other renderings may add one.
  const server = isApp && (SERVER_RENDERINGS.has(render) || (options.server ?? (interactive
    ? await ask(prompts.confirm({ message: `Add a server? (${SERVER_HINT})`, initialValue: false }))
    : false)));
  // A docs site has no blog unless asked for one.
  const blog = template === "docs" && (options.blog ?? (interactive
    ? await ask(prompts.confirm({ message: "Add a blog? (posts with RSS and Atom feeds)", initialValue: false }))
    : false));
  const styling = template === "docs" ? undefined : (options.styling ?? (interactive
    ? await ask(prompts.select({ message: "Select a styling:", options: Object.entries(STYLINGS).map(([value, label]) => ({ value, label })) }))
    : "css"));
  const language = options.language ?? (interactive
    ? await ask(prompts.select({
      message: "Select a language:",
      options: Object.entries(LANGUAGES).map(([value, label]) => ({ value, label })),
    }))
    : "ts");

  const where = relative(cwd(), target) || ".";
  const summary = [isApp && render, server && "server", blog && "blog", styling && STYLINGS[styling], LANGUAGES[language]].filter(Boolean).join(", ");
  prompts.log.step(`Scaffolding ${template} (${summary}) in ${styleText("cyan", target)}`);
  try {
    await create({ directory: target, template, render, server, blog, styling, language, packageName, existing });
  } catch (error) {
    prompts.cancel(error.message);
    exit(1);
  }

  // Install the dependencies; never start anything — the user runs the dev server.
  let installed = false;
  if (options.install) {
    prompts.log.step(`Installing dependencies with ${pm}…`);
    installed = await installDependencies(pm, target);
    if (!installed) prompts.log.warn(`${pm} install failed; run it yourself in ${where}.`);
  }
  const steps = nextSteps({ directory: where, pm, installed }).map((s) => `  ${styleText("cyan", s)}`).join("\n");
  prompts.outro(`Done. Now run:\n\n${steps}\n`);
}

// Run as a CLI, not when imported (tests). The bin is a symlink under npm, so both
// paths are resolved before comparing.
async function invokedDirectly() {
  if (!argv[1]) return false;
  try {
    return (await realpath(argv[1])) === (await realpath(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (await invokedDirectly()) {
  main().catch((error) => {
    console.error(`${styleText("red", "✖")} ${error?.message ?? error}`);
    exit(1);
  });
}
