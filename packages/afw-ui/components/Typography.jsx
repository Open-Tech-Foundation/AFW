// Typography: Heading, Text, TextLink, Code, Kbd, CodeBlock.
//
//   <Heading level={2} size="lg">Billing</Heading>
//   <Text tone="muted" size="sm">Invoices are sent on the 1st.</Text>
//   <Text as="span" truncate>{fileName}</Text>
//   <TextLink href="/settings/billing">Change plan</TextLink>
//   <TextLink href="https://status.example.com" external>Status page</TextLink>
//   Press <Kbd keys={["Ctrl", "K"]} /> to search, or run <Code>afw dev</Code>.
//   <CodeBlock label="Install" language="sh">{"npm i @opentf/afw-ui"}</CodeBlock>
//
// - The element carries the meaning (`level` picks h1–h6, `as` picks p/span/div); `size`,
//   `tone` and `weight` only change the look, as `data-*` hooks a theme reads. So an h3
//   in a card can look small without breaking the page's outline.
// - Truncation is visual only (CSS): the full text stays the accessible name and what
//   copy and find-in-page see. Give touch users another way to read it in full.

import { localizePath } from "@opentf/afw";
import { navigateOnClick } from "../internal/navigate.js";

// The look each level gets when no `size` is given.
const HEADING_SIZE = { 1: "2xl", 2: "xl", 3: "lg", 4: "md", 5: "sm", 6: "xs" };

export function Heading({ level = 2, size, children, ...rest }) {
  const n = $derived(Math.min(6, Math.max(1, Math.trunc(Number(level)) || 2)));
  const look = $derived(size ?? HEADING_SIZE[n]);
  const cls = $derived(["afw-ui-heading", rest.class]);
  return (
    <>
      {n === 1 ? (
        <h1 {...rest} class={cls} data-size={look}>{children}</h1>
      ) : n === 2 ? (
        <h2 {...rest} class={cls} data-size={look}>{children}</h2>
      ) : n === 3 ? (
        <h3 {...rest} class={cls} data-size={look}>{children}</h3>
      ) : n === 4 ? (
        <h4 {...rest} class={cls} data-size={look}>{children}</h4>
      ) : n === 5 ? (
        <h5 {...rest} class={cls} data-size={look}>{children}</h5>
      ) : (
        <h6 {...rest} class={cls} data-size={look}>{children}</h6>
      )}
    </>
  );
}

// `as`: "p" (a paragraph, the default), "span" (inside a line) or "div" (a block that
// holds other elements). `truncate`: one line with an ellipsis; `lines`: at most that
// many lines, then an ellipsis.
export function Text({ as = "p", size, tone, weight, truncate = false, lines, children, ...rest }) {
  const cls = $derived(["afw-ui-text", rest.class]);
  const clamp = $derived(Number(lines) > 0 ? Math.trunc(Number(lines)) : undefined);
  const style = $derived(clamp ? `--afw-ui-lines: ${clamp}` : undefined);
  return (
    <>
      {as === "span" ? (
        <span {...rest} class={cls} data-size={size} data-tone={tone} data-weight={weight} data-truncate={truncate ? "" : undefined} data-lines={clamp} style={style}>
          {children}
        </span>
      ) : as === "div" ? (
        <div {...rest} class={cls} data-size={size} data-tone={tone} data-weight={weight} data-truncate={truncate ? "" : undefined} data-lines={clamp} style={style}>
          {children}
        </div>
      ) : (
        <p {...rest} class={cls} data-size={size} data-tone={tone} data-weight={weight} data-truncate={truncate ? "" : undefined} data-lines={clamp} style={style}>
          {children}
        </p>
      )}
    </>
  );
}

// A path in this app ("/…", not "//host") follows the locale and navigates on the client.
const isAppPath = (href) => typeof href === "string" && href.startsWith("/") && !href.startsWith("//");

// A plain `<a>`, always underlined so it is never told apart by colour alone. (Not
// `Link`: the compiler reserves that name for the framework's own component.)
// `external`: opens in a new tab, says so to screen readers (`newTabLabel`), and keeps the
// opened page from reaching back into this one.
export function TextLink({ href, external = false, newTabLabel = "(opens in a new tab)", children, ...rest }) {
  return (
    <a
      {...rest}
      href={isAppPath(href) ? localizePath(href) : href}
      class={["afw-ui-link", rest.class]}
      target={external ? "_blank" : rest.target}
      rel={external ? "noopener noreferrer" : rest.rel}
      data-external={external ? "" : undefined}
      onclick={(e) => !external && isAppPath(href) && navigateOnClick(e)}
    >
      {children}
      {external ? (
        <span style="position:absolute;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap">
          {` ${newTabLabel}`}
        </span>
      ) : null}
    </a>
  );
}

// Inline code: a name, a value, a short command.
export function Code({ children, ...rest }) {
  return (
    <code {...rest} class={["afw-ui-code", rest.class]}>
      {children}
    </code>
  );
}

// A key or a shortcut. `keys={["Ctrl", "K"]}` renders the HTML combination form, one
// <kbd> per key inside an outer <kbd>, joined by `separator`.
export function Kbd({ keys, separator = "+", children, ...rest }) {
  const list = $derived(Array.isArray(keys) ? keys : []);
  // The keys are a list of their own, not a branch of `keys ? … : children`: a new array
  // with the same keys (every render of `keys={["Ctrl", "K"]}`) reconciles in place.
  return (
    <kbd {...rest} class={["afw-ui-kbd", rest.class]} data-combo={list.length ? "" : undefined}>
      {list.map((key, i) => (
        <span key={`${i}:${key}`} class="afw-ui-kbd-step">
          {i > 0 ? <span class="afw-ui-kbd-separator">{separator}</span> : null}
          <kbd class="afw-ui-kbd-key">{key}</kbd>
        </span>
      ))}
      {list.length ? null : children}
    </kbd>
  );
}

// A block of code. It keeps its line breaks and scrolls sideways instead of wrapping, so
// it is a tab stop (keyboard users can scroll it) named by `label`. `language` is a hook
// for a highlighter (`language-*` on the <code>, the common convention).
export function CodeBlock({ label = "Code sample", language, children, ...rest }) {
  return (
    <pre {...rest} class={["afw-ui-code-block", rest.class]} role="group" aria-label={label} tabindex="0" data-language={language}>
      <code class={language ? `language-${language}` : undefined}>{children}</code>
    </pre>
  );
}
