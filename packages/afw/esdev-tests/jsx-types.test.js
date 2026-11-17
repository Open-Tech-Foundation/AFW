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
      import { router, signal, computed, Link, mountApp, onMount, onResize, onMediaQuery, resource, invalidate, Portal, RawHtml, ErrorBoundary, ContextProvider, createContext, Pending, type RouteErrorProps, type Lazy } from "@opentf/afw";
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
      registerRoutes({}); mountApp({ pages: {}, loaders: ["/"], i18n: { locales: ["en"], defaultLocale: "en" }, viewTransitions: true });
      const pop: Transition = (el, { direction }) => el.animate([{ opacity: direction === "in" ? 0 : 1 }], 100);
      const animated = <ul><li transition={fade({ duration: 150, initial: true })} /><li in={slide({ axis: "x" })} out={fly({ y: -4 })} /><li transition={pop} /></ul>;
      // Lazy components: a loader is a tag whose props are its component's.
      function Chart({ data, title }: { data: number[]; title?: string }) { return <p>{title}{data.length}</p>; }
      const LazyChart = () => Promise.resolve({ default: Chart });
      const Annotated: Lazy<typeof Chart> = () => Promise.resolve({ default: Chart });
      const Named = () => Promise.resolve({ Chart }).then((m) => m.Chart);
      const lazyOk = <div><LazyChart data={[1]} /><Annotated data={[2]} title="t" /><Named data={[3]} /></div>;
      // @ts-expect-error a lazy component's required props are checked
      const lazyMissing = <LazyChart />;
      // @ts-expect-error and their types
      const lazyWrong = <Annotated data="x" />;
      const feed = resource(async () => [1, 2], { errors: "inline" });
      const section = <Pending fallback={<p>…</p>} error={(error, retry) => <button onclick={retry}>{String(error)}</button>}><p/></Pending>;
      const RouteError = ({ error, retry }: RouteErrorProps) => <p onclick={retry}>{error.status ?? 500}: {error.message}</p>;
      const loadingView = <Pending fallback={<p>Loading</p>} refreshing={<i>Updating</i>} refetch="fallback" delay={150}><ul>{feed.data?.length}</ul></Pending>;
      // @ts-expect-error refetch is "keep" or "fallback"
      const badRefetch = <Pending refetch="later"><p/></Pending>;
      // @ts-expect-error errors only takes "inline"
      resource(async () => 1, { errors: "throw" });
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
        // Cached resources: a server function as the fetcher, keyed by its input.
        const todos = resource(() => true, listTodos, { staleTime: 30_000, gcTime: 60_000 });
        const firstDone: boolean | undefined = todos.data?.[0].done;
        const allTodos = query(async () => [{ id: 1 }]);
        const all = resource(allTodos);
        const firstId: number | undefined = all.data?.[0].id;
        const keyed = resource(() => 3, async (id) => ({ id }), { key: (id: number) => ["user", id] });
        const keyedId: number | undefined = keyed.data?.id;
        const fresh: { id: number } | undefined = await keyed.refetch();
        await invalidate(listTodos, true, allTodos);
        // @ts-expect-error staleTime is a number of milliseconds
        resource(async () => 1, { staleTime: "soon" });
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
      // Lifecycle hooks are globals too: no import needed.
      export function Hooks() {
        onMount(() => () => {}); onCleanup(() => {});
        onResize((entry) => { const height: number = entry.contentRect.height; });
        onMediaQuery("(min-width: 768px)", (matches, event) => { const m: boolean = matches; const e: MediaQueryListEvent | undefined = event; });
        onVisibilityChange((visible, entry) => { const v: boolean = visible; const ratio: number = entry.intersectionRatio; });
        // @ts-expect-error hook callbacks keep their parameter types
        onResize((entry: string) => {});
        return <p/>;
      }
      // key on host elements and components, as keyed lists use it.
      const todos = [{ id: 1, title: "a" }];
      const keyedHost = <ul>{todos.map((todo) => <li key={todo.id} transition={slide()}>{todo.title}</li>)}</ul>;
      const keyedComponent = <ul>{todos.map((todo) => <Counter key={String(todo.id)} initial={todo.id}/>)}</ul>;
      // @ts-expect-error key is a string or a number
      const badKey = <li key={{}}/>;
      // ref on a component receives its element with what it publishes through $expose.
      const modal = $ref<{ show(): void }>();
      const withRef = <Counter ref={modal} initial={1}/>;
      // @ts-expect-error a host element's ref stays typed
      const badHostRef = <h1 ref={42}/>;
      // Listener modifiers keep the event's types.
      const modifiers = <div>
        <button onclick:once={(event) => { const button: HTMLButtonElement = event.currentTarget; const x: number = event.clientX; }}/>
        <input onKeydown:passive={(event) => { const key: string = event.key; }}/>
        <div onscroll:once-passive={() => {}} onclick:capture-listen={() => {}}/>
      </div>;
      // @ts-expect-error a modifier handler's currentTarget is the element
      const badModifierTarget = <button onclick:once={(event) => event.currentTarget.noSuchProperty}/>;
      // Dialogs, popovers and invoker commands, written as attributes.
      const overlays = <div>
        <button commandfor="dlg" command="show-modal">Open</button>
        <dialog id="dlg" closedby="any" aria-labelledby="dlg-title" onclose={(event) => { const d: HTMLDialogElement = event.currentTarget; }}>
          <h2 id="dlg-title">Title</h2><button commandfor="dlg" command="close" autofocus>Close</button>
        </dialog>
        <button popovertarget="menu" popovertargetaction="toggle">Menu</button><div id="menu" popover="auto" />
        <button interestfor="tip">?</button><div id="tip" popover="hint" />
        <div popover /><input type="checkbox" switch />
      </div>;
      // @ts-expect-error an unknown command
      const badCommand = <button command="explode"/>;
      // @ts-expect-error closedby values are checked
      const badClosedby = <dialog closedby="sometimes"/>;
      // @ts-expect-error popover values are checked
      const badPopover = <div popover="always"/>;
      // @ts-expect-error unknown modifiers are rejected
      const badModifier = <button onclick:twice={() => {}}/>;
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
