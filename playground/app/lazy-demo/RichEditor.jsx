// A rich-text editor on Quill (https://quilljs.com), a plain-JavaScript library.
// Only this module imports Quill, so the library and its stylesheet live in this
// component's own chunk: the page loads it with `() => import("./RichEditor.jsx")`.

import Quill from "quill";
import "quill/dist/quill.snow.css";

const TOOLBAR = [
  [{ header: [1, 2, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "blockquote", "code-block"],
  ["clean"],
];

export default function RichEditor(props) {
  const host = $ref();
  let editor = null;

  onMount(() => {
    editor = new Quill(host, { theme: "snow", placeholder: "Write something…", modules: { toolbar: TOOLBAR } });
    if (props.value) editor.clipboard.dangerouslyPasteHTML(props.value);
    editor.on("text-change", () => props.onchange?.(editor.getSemanticHTML()));
    editor.focus();
  });

  onCleanup(() => {
    editor = null;
  });

  // A parent's `ref` reaches these once the component has loaded.
  $expose({
    focus: () => editor?.focus(),
    clear: () => editor?.setText(""),
  });

  return (
    <div class="rich-editor rounded-lg bg-white text-slate-900">
      <div ref={host} class="min-h-48 text-base" />
    </div>
  );
}
