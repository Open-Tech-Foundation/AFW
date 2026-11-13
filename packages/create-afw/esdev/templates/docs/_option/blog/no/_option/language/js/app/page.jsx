import { Link } from "@opentf/afw";

export const metadata = { title: "{{name}}", description: "Documentation." };

export default function Home() {
  return (
    <main class="afwd-prose">
      <h1>{{name}}</h1>
      <p>Documentation, written in MDX.</p>
      <p>
        <Link href="/docs">Read the docs</Link>
      </p>
    </main>
  );
}
