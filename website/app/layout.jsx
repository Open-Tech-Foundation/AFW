import { Navbar } from "@opentf/afw-docs";
import config from "../afw.config.js";

const AFW_ORG = "https://opentechf.org";

// Site-wide SEO defaults, inherited by every route (least-specific in the metadata
// merge). `titleTemplate` brands every child page's `<title>` (e.g. "Installation —
// AFW"); a page can opt out with `title: { absolute: "…" }`. The description and
// `og:site_name` act as fallbacks when a page doesn't set its own.
export const metadata = {
  titleTemplate: "%s — AFW",
  description:
    "A high-performance full-stack web framework that compiles JSX to native Web Components, with signals for reactive state updates.",
  openGraph: {
    siteName: "AFW",
    type: "website",
  },
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Open Tech Foundation",
    url: "https://afw.opentechf.org",
    logo: "https://afw.opentechf.org/img/afw-logo.svg",
  },
  links: [
    { rel: "icon", href: "/img/afw-logo.svg" },
    { rel: "apple-touch-icon", href: "/img/afw-logo.svg" },
  ],
};

// The site is itself a product of @opentf/afw-docs (Nextra-style): the navbar — brand,
// version badge, active-route underline, GitHub icon, theme toggle — comes from the
// theme package, driven by afw.config.js. The docs section reuses it via frame={false}.
export default function WebsiteLayout(props) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-main)] text-[var(--text-main)]">
      <Navbar config={config.docs} />

      <div className="flex-1 flex flex-col">
        {props.children}
      </div>

      <footer class="site-footer">
        <div class="site-footer-inner">
          <div class="site-footer-org">
            <a href={AFW_ORG} target="_blank" rel="noreferrer" class="site-footer-org-link">
              <img src="/img/otf-logo.svg" alt="" width="24" height="24" class="site-footer-org-logo" />
              <span>© Open Tech Foundation</span>
            </a>
            <span>· MIT</span>
          </div>
          <a href="https://opentechf.org/policies" target="_blank" rel="noopener noreferrer" aria-label="Open organization policies in a new tab">
            Organization policies ↗
          </a>
          <a href="https://esrun.opentechf.org/esdev" target="_blank" rel="noreferrer" class="site-footer-built">
            Built with <strong>esdev</strong> on ES-Runtime
          </a>
        </div>
        <div class="site-footer-bottomline">No trackers, no analytics.</div>
      </footer>
    </div>
  );
}
