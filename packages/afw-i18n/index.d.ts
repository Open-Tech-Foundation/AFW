// Types for @opentf/afw-i18n: ICU messages, Intl formatters and the <T> component.

/** A locale's messages: flat keys, or nested objects read with dotted keys. */
export interface Catalog {
  [key: string]: string | Catalog;
}

/** A locale loader's result: the catalog, or a module whose default export is one. */
export type CatalogModule = Catalog | { default: Catalog };

export interface I18nOptions {
  /** The supported locales; defaults to the keys of `messages`. */
  locales?: string[];
  /** The fallback locale; defaults to the first locale, then `"en"`. */
  defaultLocale?: string;
  /** Catalogs loaded up front: `{ en: { … }, fr: { … } }`. */
  messages?: Record<string, Catalog>;
  /** Load a locale's catalog on demand, for per-locale code splitting. */
  load?: (locale: string) => CatalogModule | Promise<CatalogModule>;
}

/** The store `createI18n` returns (mostly for tests). */
export interface I18nStore {
  locales: string[];
  defaultLocale: string;
  catalogs: Map<string, Catalog>;
  load: ((locale: string) => CatalogModule | Promise<CatalogModule>) | null;
  pending: Map<string, Promise<void>>;
}

/** ICU argument values for `t()` and `<T>`. */
export type MessageValues = Record<string, unknown>;

/** Register the app's catalogs and locales. */
export function createI18n(options?: I18nOptions): I18nStore;
/** The active locale: the router's locale, else the default locale, else `"en"`. */
export function getLocale(): string;
/** Load and cache a locale's catalog through the registered `load`. */
export function loadLocale(locale: string): Promise<void>;
/** The configured locales and default, or `null` before `createI18n` runs. */
export function locales(): { locales: string[]; defaultLocale: string } | null;
/** Set a locale's catalog directly (SSR/SSG preload and tests). */
export function setCatalog(locale: string, catalog: Catalog | null | undefined): void;
/**
 * Translate `key`, ICU-formatting it with `values`. Reactive on the active locale.
 * Falls back to the default locale, then to the key itself.
 */
export function t(key: string, values?: MessageValues): string;

/** Locale-aware formatters over `Intl`, following the active locale. */
export const fmt: {
  number(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  currency(value: number | bigint, currency: string, options?: Intl.NumberFormatOptions): string;
  percent(value: number | bigint, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
  plural(value: number, options?: Intl.PluralRulesOptions): Intl.LDMLPluralRule;
  list(values: Iterable<string>, options?: Intl.ListFormatOptions): string;
};

export interface TProps {
  /** The message key. */
  id: string;
  /** ICU argument values. */
  values?: MessageValues;
}
/** `<T id="greeting" values={{ name }} />`: the translated message in a `<span>`. */
export function T(props: TProps): Node;
