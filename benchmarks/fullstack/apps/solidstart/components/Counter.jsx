import { createSignal } from "solid-js";

export default function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button id="counter" class="rounded bg-sky-600 px-3 py-1 text-white" onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  );
}
