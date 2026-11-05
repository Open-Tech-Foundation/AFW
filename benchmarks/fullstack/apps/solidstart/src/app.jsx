import { A, Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import CartBadge from "../components/CartBadge.jsx";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <div class="mx-auto max-w-4xl p-6">
          <nav class="mb-6 flex gap-4">
            <A href="/">Home</A>
            <A href="/docs/getting-started">Docs</A>
            <A href="/account">Account</A>
            <CartBadge />
          </nav>
          <main><Suspense>{props.children}</Suspense></main>
        </div>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
