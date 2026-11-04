import { Link } from "@opentf/afw";
import CartBadge from "../components/CartBadge.jsx";

export default function Layout({ children }) {
  return (
    <div class="mx-auto max-w-4xl p-6">
      <nav class="mb-6 flex gap-4">
        <Link href="/">Home</Link>
        <Link href="/docs/getting-started">Docs</Link>
        <Link href="/account">Account</Link>
        <CartBadge />
      </nav>
      <main>{children}</main>
    </div>
  );
}
