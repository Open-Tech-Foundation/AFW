import { listTodos } from "./todos.server.js";

// A server function called directly on the server: no HTTP round trip, same locals.
export default async function loader({ locals }) {
  return listTodos({}, { locals });
}
