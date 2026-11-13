import { Link } from "@opentf/afw";

export const metadata = { title: "{{name}}", description: "Documentation and blog." };

export default function Home() {
  return (
    <main class="afwd-prose">
      <h1>{{name}}</h1>
      <p>Documentation and a blog, written in MDX.</p>
      <p>
        <Link href="/docs">Read the docs</Link> · <Link href="/blog">Visit the blog</Link>
      </p>
    </main>
  );
}
