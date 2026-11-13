import { Counter } from "../index.ts";

export default function Preview() {
  return (
    <section>
      <h1>{{name}}</h1>
      <Counter start={1} />
    </section>
  );
}
