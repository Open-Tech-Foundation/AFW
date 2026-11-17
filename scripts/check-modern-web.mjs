// Modern web platform check (`tsr check-web`; CI runs it as its own step).
//
// Runs the pinned `modern-web-guidance` scanner (a root devDependency) over the code
// that ships HTML, CSS and client JS, and fails on any finding not in
// `scripts/modern-web-allow.json`. That file lists findings verified as false positives
// against their rule's keep/drop rubric, each with the reason it stays.
//
// A new finding: retrieve its guide (`pnpm exec modern-web-guidance retrieve <guide>`),
// check the rubric the scan prints, then either modernize the code or, when the rubric
// says the pattern must stay, add an entry with the reason.
//
// The scanner covers the subset of the guidance with deterministic rules; it does not
// replace reading the guide for the feature you are building.

// Runs on esdev (`runtime:` modules). The scanner is a Node CLI of its own; its bin is
// run as a program.
import { file } from "runtime:fs";
import { exit } from "runtime:process";
import { Command } from "runtime:system";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const bin = `${root}/node_modules/.bin/modern-web-guidance`;
if (!(await file(bin).exists())) {
  console.error("✗ modern-web-guidance is not installed. Pin it at the root: pnpm add -D -w modern-web-guidance@1.0.1");
  exit(1);
}

// What ships to browsers: the runtime and its components, the docs theme, the form
// package, the starter templates and the site.
const TARGETS = ["packages/afw", "packages/afw-docs", "packages/afw-form", "packages/afw-i18n", "packages/create-afw", "website/app"];

const allow = JSON.parse(await file(`${root}/scripts/modern-web-allow.json`).text());
const used = new Set();
const allowed = (target, ruleId, file) => {
  const entry = allow.find((a) => a.target === target && a.rule === ruleId && a.file === file);
  if (entry) used.add(entry);
  return !!entry;
};

const decoder = new TextDecoder();
let failures = 0;
let reviewed = 0;
for (const target of TARGETS) {
  const result = await new Command(bin, { args: ["legacy-scan", target, "--json"], cwd: root, inheritEnv: true }).output();
  if (!result.success) {
    console.error(`✗ the scanner failed on ${target}:\n${decoder.decode(result.stderr)}`);
    exit(1);
  }
  const report = JSON.parse(decoder.decode(result.stdout));
  for (const guide of report.guides ?? []) {
    for (const rule of guide.rules ?? []) {
      for (const finding of rule.findings ?? []) {
        if (allowed(target, rule.ruleId, finding.file)) {
          reviewed++;
          continue;
        }
        failures++;
        console.error(`✗ ${target}/${finding.file}:${finding.line} — ${rule.ruleId}`);
        console.error(`  ${rule.summary}`);
        console.error(`  ${finding.lineContent?.trim() ?? ""}`);
        for (const keep of rule.verifierRubric?.keepWhen ?? []) console.error(`  keep when: ${keep}`);
        for (const drop of rule.verifierRubric?.dropWhen ?? []) console.error(`  drop when: ${drop}`);
        console.error(`  guide: pnpm exec modern-web-guidance retrieve ${guide.guideId}`);
      }
    }
  }
}

// An entry the scanner no longer reports (the code changed, or this scanner version has no
// such rule) is only a warning: it may apply again after a scanner upgrade.
for (const entry of allow) {
  if (!used.has(entry)) console.warn(`⚠ not reported by this scanner: ${entry.target}/${entry.file} (${entry.rule})`);
}
if (failures) {
  console.error(`\n${failures} modern web finding(s). Modernize the code, or record a verified false positive in scripts/modern-web-allow.json.`);
  exit(1);
}
console.log(`✓ modern web check: no new findings in ${TARGETS.length} targets (${reviewed} reviewed exception(s))`);
