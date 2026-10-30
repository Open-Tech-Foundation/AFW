// "On this page" table of contents, with scroll-spy highlighting via IntersectionObserver.
// Rebuilds on route change.
//
// The outline comes from the page's `toc` export (`router.toc`, emitted by the MDX
// front-end), so it is in the served HTML and adopted at hydration: no pop-in, no layout
// shift. A page without one (plain JSX) falls back to reading its headings from the DOM
// after mount, as before.

import { isHydrating, onMount, router } from "@opentf/afw";

export default function Toc() {
  const fromPage = () =>
    (router.toc ?? [])
      .filter((h) => h.depth === 2 || h.depth === 3)
      .map((h) => ({ id: h.id, text: h.text, sub: h.depth === 3 }));

  // A server-rendered `<Toc>` upgrades the moment its module defines it, which is during
  // the router's route import and so before `router.toc` is set. It takes the outline the
  // server rendered into it instead, so the adopt walk always sees the markup it expects.
  const fromServer = () =>
    Array.from(document.querySelectorAll("nav.afwd-toc .afwd-toc-link"), (a) => ({
      id: decodeURIComponent((a.getAttribute("href") || "").slice(1)),
      text: a.textContent || "",
      sub: a.parentElement?.classList.contains("afwd-toc-sub") ?? false,
    }));

  let items = $state(isHydrating() && typeof document !== "undefined" ? fromServer() : fromPage());
  let activeId = $state("");
  let observer = null;

  // `initial`: an outline already rendered (served, then adopted) is kept as is. Assigning
  // an equal array would rebuild the list the server sent, and `router.toc` may not be set
  // yet when this first runs.
  const build = (initial = false) => {
    if (typeof document === "undefined") return;
    const root = document.getElementById("afw-content");
    if (!root) return;
    const hs = Array.from(root.querySelectorAll("h2[id], h3[id]"));
    const page = fromPage();
    if (!(initial && items.length > 0)) {
      items = page.length > 0
        ? page
        : hs.map((h) => ({ id: h.id, text: h.textContent || "", sub: h.tagName === "H3" }));
    }
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) activeId = e.target.id;
      },
      { rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );
    for (const h of hs) observer.observe(h);
  };

  onMount(() => {
    build(true);
    return () => observer && observer.disconnect();
  });

  // Rebuild when the route changes (content swaps under the same layout). Effects run at
  // construction — before `onMount` — so the first run would schedule a second, redundant
  // build of the same headings: on first paint the outline was built once by `onMount` and
  // then torn down and rebuilt a frame later, a visible flicker on every docs page. Skip that
  // run and let `onMount` do the initial build.
  let routed = false;
  $effect(() => {
    router.pathname;
    if (!routed) {
      routed = true;
      return;
    }
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => build());
  });

  return (
    <nav class="afwd-toc" aria-label="On this page">
      {() =>
        items.length > 0 ? (
          <div class="afwd-toc-inner">
            <div class="afwd-toc-heading">On this page</div>
            <ul class="afwd-toc-list">
              {items.map((h) => (
                <li class={h.sub ? "afwd-toc-item afwd-toc-sub" : "afwd-toc-item"}>
                  <a
                    href={"#" + h.id}
                    class={activeId === h.id ? "afwd-toc-link afwd-active" : "afwd-toc-link"}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
    </nav>
  );
}
