import { router } from "@opentf/afw";

export const metadata = { title: "Dashboard" };

export default function Dashboard() {
  const visits = $derived(router.data?.visits ?? 0);
  return (
    <section>
      <h1>Dashboard</h1>
      <p>Rendered in your browser, {visits} visits. Browser-only code is safe here.</p>
    </section>
  );
}
