// The esdev starters (`esdev create`, AFW group) as esdev's template format (D220),
// generated from the same `projectFiles` the Vite scaffolder uses, with the esdev
// toolchain. Nothing here is written by hand: every file of every answer combination
// comes from templates.js, so both workflows scaffold the same project.
//
// Layout of one template, as esdev reads it:
//   <name>/template.json          label, description, group and the options (questions)
//   <name>/<files>                 files every combination has, unchanged
//   <name>/_option/<o>/<v>/…       files for combinations where option o is v
//   <name>/_option/<o1>/<v1>+<o2>/<v2>/…  where every listed option has its value
// Each file sits under the fewest options that decide its contents, so an overlay never
// has to remove anything: a file appears only in the combinations that have it.
// Placeholders: {{name}}, {{pm}}, {{registry:<package>}} (esdev writes the release).

import { RENDERINGS, STYLINGS, TEMPLATES, projectFiles } from "./templates.js";

const LANGUAGES_LABELS = { ts: "TypeScript: .tsx sources and a tsconfig.json", js: "JavaScript: .jsx sources" };

/** Every package resolves to esdev's registry placeholder. */
const versions = new Proxy({}, { get: (_, pkg) => (typeof pkg === "string" ? `{{registry:${pkg}}}` : undefined) });

const choice = (value, label, description) => ({ value, label, description });
const language = {
  name: "language", question: "Select a language:", kind: "choice", default: "ts",
  choices: [choice("ts", "TypeScript", LANGUAGES_LABELS.ts), choice("js", "JavaScript", LANGUAGES_LABELS.js)],
};
const styling = {
  name: "styling", question: "Select a styling:", kind: "choice", default: "css",
  choices: Object.entries(STYLINGS).map(([value, label]) => choice(value, label, label)),
};

/** The questions of each template, in the order both scaffolders ask them. */
export const ESDEV_TEMPLATES = {
  app: {
    label: "App",
    options: [
      {
        name: "render", question: "How should pages render by default? (any folder can change it later with its own _config.js)",
        kind: "choice", default: "client",
        choices: Object.entries(RENDERINGS).map(([value, description]) => choice(value, value[0].toUpperCase() + value.slice(1), description)),
      },
      {
        // Server and mixed apps always have a server: the question is asked only otherwise.
        name: "server", question: "Add a server? (API routes, middleware, loaders and server functions)",
        kind: "confirm", default: "no", when: { render: ["client", "static"] }, otherwise: "yes",
        choices: [choice("yes", "Yes", "API routes, middleware, loaders and server functions"), choice("no", "No", "Pages only")],
      },
      styling,
      language,
    ],
    files: (o) => ({ template: "app", render: o.render, server: o.server === "yes", styling: o.styling, typescript: o.language === "ts" }),
  },
  docs: {
    label: "Docs",
    options: [
      {
        name: "blog", question: "Add a blog? (posts with RSS and Atom feeds)", kind: "confirm", default: "no",
        choices: [choice("yes", "Yes", "Posts with RSS and Atom feeds"), choice("no", "No", "Docs only")],
      },
      language,
    ],
    files: (o) => ({ template: "docs", blog: o.blog === "yes", typescript: o.language === "ts" }),
  },
  library: {
    label: "Component Library",
    run: "test",
    options: [styling, language],
    files: (o) => ({ template: "library", styling: o.styling, typescript: o.language === "ts" }),
  },
};

/** Whether an option is asked for these answers so far (its `when`). */
const asked = (option, answers) => !option.when || Object.entries(option.when).every(([name, values]) => values.includes(answers[name]));

/** Every valid combination of answers, as `{ option: value }`. */
export function combinations(options) {
  let out = [{}];
  for (const option of options) {
    out = out.flatMap((answers) => asked(option, answers)
      ? option.choices.map((c) => ({ ...answers, [option.name]: c.value }))
      : [{ ...answers, [option.name]: option.otherwise }]);
  }
  return out;
}

/** The project files for one combination, with esdev's placeholders. */
export function combinationFiles(name, answers) {
  const files = projectFiles({ name: "{{name}}", pm: "{{pm}}", versions, toolchain: "esdev", ...ESDEV_TEMPLATES[name].files(answers) });
  // esdev ships dotfiles under a leading underscore.
  if (".gitignore" in files) {
    files._gitignore = files[".gitignore"];
    delete files[".gitignore"];
  }
  return files;
}

/** The overlay folder for a set of option values: `_option/language/ts+server/yes`. */
export const overlayDir = (entries) => `_option/${entries.map(([o, v]) => `${o}/${v}`).join("+")}`;

/** All subsets of `items` of size `k`, in order. */
function subsets(items, k) {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...subsets(rest, k - 1).map((s) => [first, ...s]), ...subsets(rest, k)];
}

/**
 * One template in esdev's format: `{ "template.json": …, <path>: contents }`. Each file
 * is placed under the smallest set of options whose values decide it (none: the base).
 */
export function esdevTemplate(name) {
  const spec = ESDEV_TEMPLATES[name];
  const names = spec.options.map((o) => o.name);
  const combos = combinations(spec.options).map((answers) => ({ answers, files: combinationFiles(name, answers) }));
  const paths = [...new Set(combos.flatMap((c) => Object.keys(c.files)))].sort();
  const out = {};
  for (const path of paths) {
    let deciding = null;
    for (let k = 0; k <= names.length && !deciding; k++) {
      for (const set of subsets(names, k)) {
        // The file (or its absence) must be the same for every combination that agrees on `set`.
        const seen = new Map();
        const consistent = combos.every(({ answers, files }) => {
          const key = set.map((o) => answers[o]).join("\0");
          const value = files[path] ?? null;
          if (!seen.has(key)) seen.set(key, value);
          return seen.get(key) === value;
        });
        if (consistent) { deciding = set; break; }
      }
    }
    const placed = new Set();
    for (const { answers, files } of combos) {
      if (!(path in files)) continue;
      const dir = deciding.length ? `${overlayDir(deciding.map((o) => [o, answers[o]]))}/` : "";
      if (placed.has(dir)) continue;
      placed.add(dir);
      out[`${dir}${path}`] = files[path];
    }
  }
  out["template.json"] = `${JSON.stringify({
    label: spec.label,
    description: TEMPLATES[name],
    group: "AFW",
    ...(spec.run ? { run: spec.run } : {}),
    options: spec.options,
  }, null, 2)}\n`;
  return out;
}

/** The AFW group of esdev's template catalog. */
export function esdevCatalog() {
  return `${JSON.stringify({
    groups: [{
      name: "AFW", label: "AFW",
      description: "AFW starters: an app, a docs site or a component library",
      question: "Which AFW starter?",
      templates: Object.keys(ESDEV_TEMPLATES),
    }],
  }, null, 2)}\n`;
}

/**
 * What esdev writes for `answers` (as this package reads its format): the base files,
 * then every overlay whose options all match, with the placeholders filled in. Used to
 * check that the generated starters reproduce `projectFiles` exactly.
 */
export function applyEsdevTemplate(template, answers, { name, pm, registry }) {
  const files = {};
  const fill = (text) => text.replaceAll("{{name}}", name).replaceAll("{{pm}}", pm)
    .replace(/\{\{registry:([^}]+)\}\}/g, (_, pkg) => registry(pkg));
  const overlays = [];
  for (const [path, contents] of Object.entries(template)) {
    if (path === "template.json") continue;
    const m = /^_option\/((?:[^/+]+\/[^/+]+\+)*[^/+]+\/[^/+]+)\/(.*)$/.exec(path);
    if (!m) { files[path] = fill(contents); continue; }
    const conditions = m[1].split("+").map((pair) => pair.split("/"));
    if (conditions.every(([o, v]) => answers[o] === v)) overlays.push([conditions.length, m[2], contents]);
  }
  for (const [, path, contents] of overlays.sort((a, b) => a[0] - b[0])) files[path] = fill(contents);
  if (files._gitignore !== undefined) {
    files[".gitignore"] = files._gitignore;
    delete files._gitignore;
  }
  return files;
}
