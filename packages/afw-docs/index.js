// Public barrel for @opentf/afw-docs.
//
// Components are shipped as JSX source and compiled by the consuming app's pipeline
// (the `@opentf/afw` Link.jsx model) — each becomes a Custom Element with CSR + SSG
// renderers. Plain re-exports are enough: a component registers on the first read of
// its `.tag`, which every place that renders it does, so importing `{ Navbar }` pulls
// in the Navbar and what it uses — and a bundler drops every component you don't.

export { createSearch } from "./search.js";

export { default as DocsLayout } from "./components/DocsLayout.jsx";
export { default as Navbar } from "./components/Navbar.jsx";
export { default as NavbarLink } from "./components/NavbarLink.jsx";
export { default as SidebarToggle } from "./components/SidebarToggle.jsx";
export { default as NavIcon } from "./components/NavIcon.jsx";
export { default as Sidebar } from "./components/Sidebar.jsx";
export { default as Toc } from "./components/Toc.jsx";
export { default as Footer } from "./components/Footer.jsx";
export { default as Breadcrumbs } from "./components/Breadcrumbs.jsx";
export { default as Pagination } from "./components/Pagination.jsx";
export { default as LastUpdated } from "./components/LastUpdated.jsx";
export { default as ThemeToggle } from "./components/ThemeToggle.jsx";
export { default as SearchTrigger } from "./components/SearchTrigger.jsx";
export { default as Search } from "./components/Search.jsx";
export { default as Callout } from "./components/Callout.jsx";
export { default as CodeBlock } from "./components/CodeBlock.jsx";
export { default as Tabs } from "./components/Tabs.jsx";
export { default as Steps } from "./components/Steps.jsx";
export { default as Table } from "./components/Table.jsx";
export { default as Cards } from "./components/Cards.jsx";
export { default as Card } from "./components/Card.jsx";
export { default as Tooltip } from "./components/Tooltip.jsx";
export { default as BlogLayout } from "./components/BlogLayout.jsx";
export { default as PostList } from "./components/PostList.jsx";
export { default as PostCard } from "./components/PostCard.jsx";
export { default as PostBanner } from "./components/PostBanner.jsx";
export { default as PostMeta } from "./components/PostMeta.jsx";
export { default as ReadingTime } from "./components/ReadingTime.jsx";
export { default as FeedLinks } from "./components/FeedLinks.jsx";
