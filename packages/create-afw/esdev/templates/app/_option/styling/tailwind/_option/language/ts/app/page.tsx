import Counter from "./Counter.tsx";

export const metadata = { title: "{{name}}" };

export default function Home() {
  return (
    <section>
      <h1 class="mb-4 text-3xl font-bold">{{name}}</h1>
      <p>Edit <code>app/page.tsx</code> and save: the page updates in place.</p>
      <Counter start={0} />
    </section>
  );
}
