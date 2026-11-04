import { invalidate, resource, router } from "@opentf/afw";
import { addTodo, listTodos } from "./todos.server.js";

// Exposed for the browser tests: the stubs the build put in place of the server module.
globalThis.__todosFns = { addTodo, invalidate, listTodos };

export default function Todos() {
  // Live data from a server function: invalidate(listTodos) refetches it.
  const live = resource(() => listTodos({}));
  return (
    <section>
      <ul id="todos">{(router.data?.todos ?? []).map((t) => <li>{t}</li>)}</ul>
      <p id="live-count">{live.data ? live.data.todos.length : ""}</p>
    </section>
  );
}
