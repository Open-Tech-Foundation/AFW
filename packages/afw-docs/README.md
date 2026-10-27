<div align="center">

# @opentf/afw-docs

***Documentation and blog sites built as ordinary AFW apps***

[Docs](https://afw.opentechf.org/packages/afw-docs) | [API](https://afw.opentechf.org/api/afw-docs) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-docs/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> Write pages as MDX in `app/`. The theme supplies the navbar, sidebar, table of
> contents, breadcrumbs, search and prev/next links, and generates the navigation
> from your folders at build time. The [AFW website](https://afw.opentechf.org) is
> built with it.

```jsx
// app/docs/layout.jsx
import { DocsLayout } from "@opentf/afw-docs";
import config from "../../afw.config.js";

export default function Layout(props) {
  return <DocsLayout config={config.docs}>{props.children}</DocsLayout>;
}
```

```mdx
---
title: Reactivity
description: Signal-based state.
---

import { Callout } from "@opentf/afw-docs";

# Reactivity

<Callout type="tip">Mix components into Markdown freely.</Callout>
```

Every folder under `app/` with a layout like this becomes its own section with its
own sidebar: `app/docs` serves `/docs` and `app/api` serves `/api`.

> [!NOTE]
> **Alpha.** Components, options and class names can change between minor
> versions; see the [changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-docs/CHANGELOG.md).

## Why afw-docs

| Need | How afw-docs meets it |
| --- | --- |
| 🧭 **Navigation from folders** | The sidebar, breadcrumbs and prev/next are generated from `app/`; `_meta.js` sets order and labels |
| 🔎 **Search without a service** | A static index built from the prerendered HTML by `afwc`, queried in the browser |
| ✍️ **MDX with components** | Callouts, tabs, steps, cards and code blocks with copy buttons, highlighted at build time |
| 📰 **Blog included** | Post lists, banners, reading time and RSS/Atom feeds |
| 🕒 **Last updated and edit links** | Dates from git history or frontmatter, linked to the source file |
| 🌗 **Themeable** | Light and dark modes driven by `--afw-*` CSS variables, in an overridable cascade layer |
| 🤖 **LLM-ready** | `llms.txt` and `llms-full.txt` generated at build |

## Install

```sh
pnpm add @opentf/afw-docs @opentf/afw
pnpm add -D @opentf/esdev-plugin-afw @opentf/afw-cli
```

`esdev create my-docs --template=docs` generates a complete site. To add the theme
to an existing project, import its stylesheet and register the build plugins:

```css
/* app/global.css */
@import "@opentf/afw-docs/theme";
```

```json
{
  "plugins": [
    { "module": "@opentf/esdev-plugin-afw", "options": { "mode": "ssg" } },
    { "module": "@opentf/afw-docs/build", "export": "docsNavPlugin", "options": { "appDir": "app" } },
    { "module": "@opentf/afw-docs/build", "export": "lastUpdatedPlugin", "options": { "appDir": "app" } },
    { "module": "@opentf/afw-docs/build", "export": "blogPostsPlugin", "options": { "appDir": "app", "contentDir": "blog" } }
  ]
}
```

`appDir` is resolved from the directory esdev runs in.

## Configure

```js
// afw.config.js
import { defineDocsConfig } from "@opentf/afw-docs/config";

export default defineDocsConfig({
  site: { url: "https://docs.example.com" },
  docs: {
    title: "My Project",
    github: "https://github.com/me/my-project",
    repoUrl: "https://github.com/me/my-project",
    nav: [
      { label: "Docs", href: "/docs" },
      { label: "Blog", href: "/blog" },
    ],
    lastUpdated: true,
  },
});
```

## Components

| Group | Components |
| --- | --- |
| **Layouts** | `DocsLayout`, `BlogLayout` |
| **Shell** | `Navbar`, `NavbarLink`, `Sidebar`, `SidebarToggle`, `Toc`, `Breadcrumbs`, `Pagination`, `Footer`, `LastUpdated`, `ThemeToggle`, `Search`, `SearchTrigger` |
| **Content** | `Callout`, `Tabs`, `Steps`, `CodeBlock`, `Table`, `Cards`, `Card`, `Tooltip`, `NavIcon` |
| **Blog** | `PostList`, `PostCard`, `PostBanner`, `PostMeta`, `ReadingTime` |

## Entry points

| Import | Contents |
| --- | --- |
| `@opentf/afw-docs` | Every component above, plus `createSearch` |
| `@opentf/afw-docs/theme` | The default light/dark stylesheet |
| `@opentf/afw-docs/config` | `defineDocsConfig` and the config types |
| `@opentf/afw-docs/build` | `docsNavPlugin`, `blogPostsPlugin`, `lastUpdatedPlugin`, feed and `llms.txt` renderers |
| `@opentf/afw-docs/nav`, `/posts`, `/updated` | Generated navigation, post list and last-updated map |
| `@opentf/afw-docs/search` | Browser search: `createSearch`, `tokenize`, `excerptParts` |

## Styling

The theme's own elements use `afwd-*` classes (`.afwd-sidebar`, `.afwd-callout-tip`),
and its colours come from `--afw-*` variables that switch on `[data-theme='dark']`.
All theme rules sit in the `afw-docs` cascade layer, so any rule in your own
stylesheet overrides them without raising specificity.

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
