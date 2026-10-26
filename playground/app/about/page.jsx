import { Link } from "@opentf/afw";

export const metadata = {
  title: "About AFW",
  description:
    "AFW is a zero-VDOM, high-performance fullstack framework built on native Web Components and signals.",
  canonical: "/about",
  openGraph: { image: "/og/about.png" },
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About AFW",
  },
};

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-white">About AFW</h1>
      <p className="text-slate-300">This framework is strictly structured to provide a zero-VDOM, high-performance experience using native Web Components.</p>
      <Link href="/" className="text-blue-400 hover:underline inline-block">Go Back Home</Link>
    </div>
  )
}
