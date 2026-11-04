import Link from "next/link";
import CartBadge from "../components/CartBadge.jsx";
import "./globals.css";

export const metadata = { title: "Store" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-4xl p-6">
          <nav className="mb-6 flex gap-4">
            <Link href="/">Home</Link>
            <Link href="/docs/getting-started">Docs</Link>
            <Link href="/account">Account</Link>
            <CartBadge />
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
