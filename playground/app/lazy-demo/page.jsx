// Lazy component demo: a rich-text editor (Quill) in a native <dialog>. The editor
// and the whole Quill library download only when the dialog first opens — or when
// you hover the button, which preloads them.

import { Pending, RawHtml } from "@opentf/afw";

const RichEditor = () => import("./RichEditor.jsx");

export const metadata = { title: "Lazy component — rich-text editor" };

/** Has the browser fetched the editor's chunk yet? (Read from the resource timeline.) */
const fetched = () =>
  performance.getEntriesByType("resource").some((e) => /RichEditor/.test(e.name));

export default function LazyDemoPage() {
  const dialog = $ref();
  const editor = $ref();
  let opened = $state(false); // stays true once opened: the editor keeps its content
  let draft = $state("<p>Hello from a <strong>lazy</strong> component.</p>");
  let saved = $state("");
  let loaded = $state(fetched());

  const watch = () => {
    // Poll the resource timeline briefly to show when the chunk arrives.
    let tries = 0;
    const timer = setInterval(() => {
      loaded = fetched();
      if (loaded || ++tries > 50) clearInterval(timer);
    }, 100);
  };

  const open = () => {
    opened = true;
    dialog.showModal();
    watch();
  };

  const preload = () => {
    RichEditor(); // calling the loader starts the download early
    watch();
  };

  const save = () => {
    saved = draft;
    dialog.close();
  };

  return (
    <div class="space-y-8">
      <header class="space-y-2">
        <h1 class="text-3xl font-bold text-white">Lazy component</h1>
        <p class="max-w-2xl text-slate-400">
          The editor is <code>const RichEditor = () =&gt; import("./RichEditor.jsx")</code>.
          Its code — and the Quill library it uses — stays out of this page until the
          dialog first opens. Hovering the button preloads it.
        </p>
      </header>

      <div class="flex flex-wrap items-center gap-4">
        <button
          onclick={open}
          onmouseenter={preload}
          class="rounded-lg bg-indigo-500 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-600"
        >
          Write a note
        </button>
        <span class={loaded ? "text-sm text-emerald-400" : "text-sm text-slate-400"}>
          {loaded ? "Editor code: downloaded" : "Editor code: not downloaded yet"}
        </span>
      </div>

      <section class="space-y-2">
        <h2 class="text-sm font-bold uppercase tracking-wide text-indigo-400">Saved note</h2>
        {saved ? (
          <div class="saved-note rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <RawHtml html={saved} />
          </div>
        ) : (
          <p class="text-sm text-slate-500">Nothing saved yet.</p>
        )}
      </section>

      <dialog
        ref={dialog}
        class="m-auto w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-800 p-0 text-slate-100 backdrop:bg-black/60"
      >
        <div class="space-y-4 p-6">
          <h2 class="text-lg font-semibold text-white">New note</h2>
          {opened && (
            <Pending fallback={<p class="py-16 text-center text-slate-400">Loading the editor…</p>} delay={150}>
              <RichEditor ref={editor} value={draft} onchange={(html) => (draft = html)} />
            </Pending>
          )}
          <div class="flex justify-end gap-3">
            <button onclick={() => editor.clear()} class="rounded-lg px-4 py-2 text-slate-300 hover:bg-slate-700">Clear</button>
            <button onclick={() => dialog.close()} class="rounded-lg px-4 py-2 text-slate-300 hover:bg-slate-700">Cancel</button>
            <button onclick={save} class="rounded-lg bg-indigo-500 px-4 py-2 font-medium text-white hover:bg-indigo-600">Save</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
