import Counter from "./Counter.jsx";

export const metadata = { title: "{{name}}" };

export default function Home() {
  return (
    <section>
      <h1>{{name}}</h1>
      <p>Edit <code>app/page.jsx</code> and save: the page updates in place.</p>
      <Counter start={0} />
    </section>
  );
}
