import { Link } from "@opentf/afw";

export default function Layout({ children }: { children: unknown }) {
  return (
    <>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
      </nav>
      <main>{children}</main>
    </>
  );
}
