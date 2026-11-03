import { Link } from "@opentf/afw";

export default function Layout({ children }) {
  return (
    <div>
      <nav><Link href="/">Home</Link> <Link href="/about">About</Link> <Link href="/todos">Todos</Link></nav>
      <main>{children}</main>
    </div>
  );
}
