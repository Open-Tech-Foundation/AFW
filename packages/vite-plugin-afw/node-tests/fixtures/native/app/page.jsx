import Badge from "./Badge.tsx";
import Counter from "./Counter.jsx";

export default function Home() {
  return (
    <section>
      <h1 id="title">Home on Vite</h1>
      <Counter start={1} />
      <Badge label="from tsx" />
    </section>
  );
}
