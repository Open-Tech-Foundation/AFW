import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import CartBadge from "../../components/CartBadge.jsx";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: "utf-8" }, { title: "Store" }], links: [{ rel: "stylesheet", href: styles }] }),
  shellComponent: Shell,
});

function Shell({ children }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <div className="mx-auto max-w-4xl p-6">
          <nav className="mb-6 flex gap-4">
            <Link to="/">Home</Link>
            <Link to="/docs/getting-started">Docs</Link>
            <Link to="/account">Account</Link>
            <CartBadge />
          </nav>
          <main>{children}</main>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
