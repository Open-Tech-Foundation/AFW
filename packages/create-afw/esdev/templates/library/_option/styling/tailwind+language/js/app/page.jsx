import { Counter } from "../index.js";

export default function Preview() {
  return (
    <section>
      <h1 class="mb-4 text-2xl font-bold">{{name}}</h1>
      <Counter start={1} />
    </section>
  );
}
