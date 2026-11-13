import { invalidate, router } from "@opentf/afw";
import { addTodo } from "./todos.server.ts";

export const metadata = { title: "Todos" };

export default function Todos() {
  let title = $state("");
  const todos = $derived((router.data as { todos?: string[] } | undefined)?.todos ?? []);

  async function add(event: SubmitEvent) {
    event.preventDefault();
    await addTodo({ title });
    title = "";
    await invalidate(); // reload this page's loader data
  }

  return (
    <section>
      <h1 class="mb-4 text-2xl font-bold">Todos</h1>
      <ul class="mb-4 list-disc pl-6">
        {todos.map((todo: string) => <li>{todo}</li>)}
      </ul>
      <form onsubmit={add}>
        <input class="rounded-md border px-2 py-1" value={title} oninput={(e: Event) => (title = (e.target as HTMLInputElement).value)} placeholder="New todo" />
        <button class="ml-2 rounded-md bg-sky-600 px-3 py-1 text-white" type="submit">Add</button>
      </form>
    </section>
  );
}
