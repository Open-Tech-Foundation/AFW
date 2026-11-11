import { expect, test } from "runtime:test";
import { copy, file, makeTempDir, mkdir, readDir, remove, stat, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { Command } from "runtime:system";

test("published framework types support strict TS starters and reject invalid JSX", async () => {
  const packageDir = dirname(dirname(fromFileURL(import.meta.url)));
  await mkdir(".cache", { recursive: true });
  const scratch = await makeTempDir({ dir: ".cache", prefix: "jsx-types-" });
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
    const manifest = JSON.parse(await file(join(packageDir, "package.json")).text());
    const installed = join(scratch, "node_modules/@opentf/afw");
    await copyPath(join(packageDir, "package.json"), join(installed, "package.json"));
    for (const path of manifest.files.filter((path) => !path.startsWith("!"))) {
      await copyPath(join(packageDir, path), join(installed, path));
    }
    await write(join(scratch, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, isolatedModules: true, moduleDetection: "force",
        module: "ESNext", moduleResolution: "bundler", jsx: "preserve",
        jsxImportSource: "@opentf/afw", lib: ["ESNext", "DOM", "DOM.Iterable"],
        skipLibCheck: false, types: [],
      }, include: ["*.tsx"],
    }));
    await write(join(scratch, "pages.tsx"), `
      import { router, signal, computed, Link, mountApp, onMount, onResize, onMediaQuery, resource, Portal, RawHtml, ErrorBoundary, ContextProvider, createContext } from "@opentf/afw";
      import { registerRoutes, query, action, type StandardSchemaV1 } from "@opentf/afw/server";
      import { fade, fly, slide, type Transition } from "@opentf/afw/transition";
      export function Counter({ initial = 0 }: { initial?: number }) {
        let count = $state(initial);
        return <button onclick={event => { event.currentTarget.disabled = true; count++; }}>{count}</button>;
      }
      export function Layout({ children }: { children: unknown }) { return <main>{children}</main>; }
      export function Home() {
        return <Layout><h1>{router.data?.message}</h1><Counter initial={1}/>
          <input onInput={event => { event.currentTarget.value = "ok"; }} />
          <Portal to="body"><p>Portaled</p></Portal>
          <RawHtml html="<b>HTML</b>"/><ErrorBoundary fallback={() => <p>Failed</p>}><p>Safe</p></ErrorBoundary>
          <ContextProvider context={createContext("light")} value="dark"><p>Theme</p></ContextProvider>
          <Link href="/docs">Docs</Link><afw-card data-kind="example" aria-hidden={false}/>
          <svg viewBox="0 0 10 10"><circle cx={5} cy={5} r={3}/></svg>
        </Layout>;
      }
      const value = signal(1); const doubled: number = computed(() => value.value * 2).value;
      onMount(() => () => {}); onResize(entry => { const width: number = entry.contentRect.width; });
      onMediaQuery("(prefers-reduced-motion)", matches => { const reduced: boolean = matches; });
      const asyncValue = resource(async () => 42); const result: number | undefined = asyncValue.data;
      const ref = signal<HTMLHeadingElement | null>(null);
      const heading = <h1 ref={ref} class={{ active: true }}>Hello</h1>;
      registerRoutes({}); mountApp({ pages: {}, loaders: ["/"], i18n: { locales: ["en"], defaultLocale: "en" } });
      const pop: Transition = (el, { direction }) => el.animate([{ opacity: direction === "in" ? 0 : 1 }], 100);
      const animated = <ul><li transition={fade({ duration: 150, initial: true })} /><li in={slide({ axis: "x" })} out={fly({ y: -4 })} /><li transition={pop} /></ul>;
      // @ts-expect-error a transition is a function, not a name
      const badTransition = <p transition="fade"/>;
      // @ts-expect-error native event targets retain their type
      const badEvent = <button onclick={event => event.currentTarget.noSuchProperty}/>;
      // @ts-expect-error boolean attribute does not accept an object
      const badAttr = <button disabled={{}}/>;
      // @ts-expect-error typed component props are checked
      const badProp = <Counter initial="one"/>;
      // @ts-expect-error signal writes retain their value type
      value.value = "one";
      // Server functions keep their signatures: input from the schema, output from the function.
      const titleSchema = {} as StandardSchemaV1<{ title: string }>;
      const addTodo = action(titleSchema, async ({ title }, { locals }) => ({ id: 1, title, by: locals.user }));
      const listTodos = query(async (done: boolean) => [{ done }]);
      async function useServerFunctions() {
        const added: { id: number; title: string } = await addTodo({ title: "x" });
        const listed: { done: boolean }[] = await listTodos(true);
        // @ts-expect-error the schema's input type is checked
        await addTodo({ title: 1 });
        // @ts-expect-error query input types are checked too
        await listTodos("yes");
        return { added, listed };
      }
      // Compiler macros are typed globals: no import, no local declarations.
      const Theme = createContext("light");
      export function Macros() {
        let name = $state("Ada");
        let unset = $state<number>();
        const greeting: string = $derived(\`Hi \${name}\`);
        $effect(() => { console.log(greeting); return () => {}; });
        const box = $ref<HTMLDivElement>();
        const theme: string = $context(Theme);
        $expose({ reset() { name = ""; } });
        const maybe: number | undefined = unset;
        // @ts-expect-error $state keeps the initial value's type
        name = 1;
        // @ts-expect-error $context reads the context's value type
        const wrong: number = $context(Theme);
        return <div ref={box}>{greeting}{theme}{maybe}</div>;
      }
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
