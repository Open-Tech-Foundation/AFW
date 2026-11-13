import { Link } from "@opentf/afw";

export default function Layout({ children }) {
  return (
    <>
      <nav class="mb-8 flex gap-4 text-sky-700">
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/todos">Todos</Link>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      <main>{children}</main>
    </>
  );
}
