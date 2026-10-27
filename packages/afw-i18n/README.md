<div align="center">

# @opentf/afw-i18n

***ICU messages, `Intl` formatters and locale routing for AFW***

[Docs](https://afw.opentechf.org/packages/afw-i18n) | [API](https://afw.opentechf.org/api/afw-i18n) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-i18n/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> The locale lives in the URL (`/fr/about`), the router exposes it as a signal, and
> `t()` reads that signal. A translation in your markup is one binding, so changing
> locale updates exactly the translated text.

```jsx
import { createI18n, fmt, t } from "@opentf/afw-i18n";

createI18n({
  locales: ["en", "fr"],
  defaultLocale: "en",
  messages: {
    en: { cart: "{count, plural, =0 {Your cart is empty} one {# item} other {# items}}" },
    fr: { cart: "{count, plural, =0 {Votre panier est vide} one {# article} other {# articles}}" },
  },
});

export default function Cart(props) {
  return (
    <p>
      {t("cart", { count: props.items.length })} · {fmt.currency(props.total, "EUR")}
    </p>
  );
}
```

On `/cart` this renders "3 items · €42.00"; on `/fr/cart`, "3 articles · 42,00 €".

> [!NOTE]
> **Alpha.** The API can change between minor versions; see the
> [changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-i18n/CHANGELOG.md).

## Why afw-i18n

| Need | How afw-i18n meets it |
| --- | --- |
| 🌍 **Real grammar** | Full ICU MessageFormat: plurals for every locale's rules, `select`, number and date skeletons |
| 🔗 **URL-prefix routing** | One locale per URL, so each page is cacheable, indexable and free of hydration mismatches |
| 🎯 **Fine-grained** | `t()` and `fmt.*` read the reactive locale; only translated text updates |
| 📦 **Lazy catalogs** | Load each locale's messages as its own chunk, on demand |
| 🪶 **Native formatting** | `fmt.*` wraps the browser's `Intl` APIs, memoized per locale |
| 🛟 **Never crashes** | Missing keys fall back from the active locale to the default, then to the key itself |

## Install

```sh
pnpm add @opentf/afw-i18n
```

`@opentf/afw` is a peer dependency. Apps that don't import this package ship none
of it.

## Locale routing

Declare the locales once and pass them to `mountApp` (and to your prerender or
request renderer):

```js
// afw.config.js
export default { i18n: { locales: ["en", "fr", "ja"], defaultLocale: "en" } };
```

```js
// entry.js
import { mountApp } from "@opentf/afw";
import { pages, guard } from "@afw/routes";
import config from "./afw.config.js";

mountApp({ pages, guard, i18n: config.i18n, target: document.getElementById("app") });
```

The default locale has no prefix (`/pricing`); the others do (`/fr/pricing`). The
router strips the prefix, exposes `router.locale`, and `<Link>` keeps links in
the active locale. Switching language is a navigation to the localized URL.

## Lazy catalogs

```js
createI18n({
  locales: ["en", "fr", "ja"],
  defaultLocale: "en",
  load: (locale) => ({
    en: () => import("./messages/en.json"),
    fr: () => import("./messages/fr.json"),
    ja: () => import("./messages/ja.json"),
  })[locale](),
});

await loadLocale("fr"); // before rendering a page in that locale
```

`load` registers the loader; it does not fetch by itself. Preload the active and
default locales in a route guard or your prerender script.

## API

| Export | Purpose |
| --- | --- |
| `createI18n({ locales, defaultLocale, messages, load })` | Register catalogs, eager (`messages`) or lazy (`load`) |
| `t(key, values?)` | Translate and ICU-format; reactive on the active locale |
| `<T id values />` | `t()` as a component that renders a `<span>` |
| `loadLocale(locale)` | Load and cache a locale through `load` |
| `setCatalog(locale, catalog)` | Set a catalog directly, e.g. when preloading on the server |
| `getLocale()` | The active locale |
| `locales()` | The configured locales and default |
| `fmt.number`, `fmt.currency`, `fmt.percent` | Number formatting |
| `fmt.date`, `fmt.relativeTime` | Dates and relative times ("2 days ago") |
| `fmt.list`, `fmt.plural` | Lists ("a, b, and c") and plural categories |

## Documentation

| Doc | Purpose |
| --- | --- |
| [Overview](https://afw.opentechf.org/packages/afw-i18n) | Setup, `t()`, `<T>` and ICU messages, with a live demo |
| [Locale routing](https://afw.opentechf.org/packages/afw-i18n/routing) | URL prefixes, `router.locale`, prerendering every locale |
| [Formatting](https://afw.opentechf.org/packages/afw-i18n/formatting) | Every `fmt.*` helper |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
