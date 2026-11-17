import { expect, test } from "runtime:test";
import { copy, file, makeTempDir, mkdir, readDir, remove, stat, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { Command } from "runtime:system";

test("published afw-i18n types check strict TS usage and reject misuse", async () => {
  const packages = dirname(dirname(fromFileURL(import.meta.url)));
  await mkdir(".cache", { recursive: true });
  const scratch = await makeTempDir({ dir: ".cache", prefix: "i18n-types-" });
  async function copyPath(source, target) {
    if ((await stat(source)).isDir) {
      await mkdir(target, { recursive: true });
      for (const entry of await readDir(source)) await copyPath(join(source, entry.name), join(target, entry.name));
    } else {
      await mkdir(dirname(target), { recursive: true });
      await copy(source, target);
    }
  }
  try {
    // Only the published files and exports, without workspace aliases.
    for (const name of ["afw", "afw-i18n"]) {
      const source = join(packages, name);
      const manifest = JSON.parse(await file(join(source, "package.json")).text());
      for (const path of ["package.json", ...manifest.files.filter((path) => !path.startsWith("!"))]) {
        await copyPath(join(source, path), join(scratch, "node_modules/@opentf", name, path));
      }
    }
    await write(join(scratch, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, isolatedModules: true, moduleDetection: "force",
        module: "ESNext", moduleResolution: "bundler", jsx: "preserve",
        jsxImportSource: "@opentf/afw", lib: ["ESNext", "DOM", "DOM.Iterable"],
        skipLibCheck: false, types: [],
      }, include: ["*.tsx"],
    }));
    await write(join(scratch, "i18n.tsx"), `
      import { createI18n, getLocale, loadLocale, locales, setCatalog, t, fmt, T, type Catalog, type I18nStore } from "@opentf/afw-i18n";
      const en: Catalog = { greeting: "Hello, {name}!", nav: { home: "Home" } };
      const store: I18nStore = createI18n({ locales: ["en", "fr"], defaultLocale: "en", messages: { en } });
      createI18n({ load: (locale) => import("./" + locale + ".json") as Promise<{ default: Catalog }> });
      createI18n({ load: async () => en });
      createI18n();
      const locale: string = getLocale();
      const loaded: Promise<void> = loadLocale("fr");
      const configured = locales();
      const fallback: string | undefined = configured?.defaultLocale;
      setCatalog("fr", { greeting: "Bonjour, {name} !" }); setCatalog("de", null);
      const text: string = t("greeting", { name: "Ada" }) + t("nav.home");
      const formatted: string[] = [
        fmt.number(1234.5), fmt.currency(189, "USD", { minimumFractionDigits: 0 }), fmt.percent(0.42),
        fmt.date(new Date(), { dateStyle: "long" }), fmt.date(Date.now()), fmt.relativeTime(-3, "day"),
        fmt.list(["a", "b", "c"], { type: "disjunction" }),
      ];
      const category: Intl.LDMLPluralRule = fmt.plural(2);
      export function Greeting({ name }: { name: string }) {
        return <p><T id="greeting" values={{ name }} /> <T id="nav.home" /></p>;
      }
      // @ts-expect-error t() takes a string key
      t(1);
      // @ts-expect-error <T> needs an id
      const noId = <T />;
      // @ts-expect-error relativeTime takes an Intl unit
      fmt.relativeTime(1, "fortnight");
      // @ts-expect-error a catalog holds strings or nested catalogs
      setCatalog("en", { count: 1 });
    `);
    const checked = await new Command("pnpm", {
      args: ["exec", "tsc", "-p", join(scratch, "tsconfig.json")], inheritEnv: true,
    }).output();
    const output = new TextDecoder().decode(checked.stdout) + new TextDecoder().decode(checked.stderr);
    if (!checked.success) throw new Error(output);
    expect(checked.success).toBe(true);
  } finally {
    await remove(scratch, { recursive: true });
  }
});
