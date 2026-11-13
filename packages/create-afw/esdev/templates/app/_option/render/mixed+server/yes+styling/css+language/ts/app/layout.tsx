import { Link } from "@opentf/afw";

export default function Layout({ children }: { children: unknown }) {
  return (
    <>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/todos">Todos</Link>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      <main>{children}</main>
    </>
  );
}
