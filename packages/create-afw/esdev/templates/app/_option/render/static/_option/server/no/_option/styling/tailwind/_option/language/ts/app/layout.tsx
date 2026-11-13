import { Link } from "@opentf/afw";

export default function Layout({ children }: { children: unknown }) {
  return (
    <>
      <nav class="mb-8 flex gap-4 text-sky-700">
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
      </nav>
      <main>{children}</main>
    </>
  );
}
