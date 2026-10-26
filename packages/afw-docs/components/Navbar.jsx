// Top navigation bar: brand, top-level links, search, GitHub, theme toggle. All
// content is driven by the `docs` config object passed down from DocsLayout.
// Top-level links support a per-item `icon` (NavIcon name) and `external` flag, and
// the active route is underlined (see NavbarLink). The search trigger only renders
// when a search provider is configured.

import ThemeToggle from "./ThemeToggle.jsx";
import SearchTrigger from "./SearchTrigger.jsx";
import Search from "./Search.jsx";
import SidebarToggle from "./SidebarToggle.jsx";
import NavbarLink from "./NavbarLink.jsx";
import NavIcon from "./NavIcon.jsx";
import { Link } from "@opentf/afw";

// `aria-label` / `aria-labelledby` name the banner landmark, `navLabel` names the
// primary navigation landmark, and `id` lets a caller reference the header.
export default function Navbar(props) {
  const config = props.config || {};
  const links = config.nav || [];
  const navLabel = props.navLabel || "Main navigation";
  const ariaLabel = props["aria-label"] || props.ariaLabel;
  const ariaLabelledby = props["aria-labelledby"] || props.ariaLabelledby;

  return (
    <header
      id={props.id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      class="afw-navbar"
    >
      <div class="afw-navbar-inner">
        <div class="afw-navbar-lead">
          <SidebarToggle />
          <Link href={config.homeUrl || "/"} class="afw-navbar-brand">
            {config.logo ? <img src={config.logo} alt="" class="afw-navbar-logo" /> : null}
            <span class="afw-navbar-title">{config.title || "Docs"}</span>
            {config.version ? <span class="afw-navbar-version">{config.version}</span> : null}
          </Link>
        </div>

        <div class="afw-navbar-search">
          {config.search ? <SearchTrigger /> : null}
        </div>

        <div class="afw-navbar-right">
          <nav class="afw-navbar-nav" aria-label={navLabel}>
            {links.map((l) => (
              <NavbarLink link={l} />
            ))}
          </nav>
          <div class="afw-navbar-actions">
            {config.github ? (
              <a href={config.github} target="_blank" rel="noreferrer" class="afw-navbar-icon" aria-label="GitHub">
                <NavIcon name="github" />
              </a>
            ) : null}
            <ThemeToggle />
          </div>
          {config.search ? <Search /> : null}
        </div>
      </div>
    </header>
  );
}
