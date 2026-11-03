import { beforeEach, describe, expect, test } from "runtime:test";

import { configureI18n, setRouteState } from "@opentf/afw";

import { fmt } from "./format.js";
import { createI18n, getLocale, loadLocale, setCatalog, t } from "./i18n.js";

const messages = {
  en: {
    greeting: "Hello, {name}",
    "cart.items": "{count, plural, one {# item} other {# items}}",
    nested: { hi: "Hi" },
  },
  fr: {
    greeting: "Bonjour, {name}",
    "cart.items": "{count, plural, one {# article} other {# articles}}",
  },
  pl: {
    // Polish distinguishes one / few / many — exercises real ICU plural rules.
    files: "{count, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}",
  },
};

// Drive the active locale through the router state (what `t()`/`fmt` read).
const setLocale = (locale) => setRouteState({ locale });

describe("afw-i18n t()", () => {
  beforeEach(() => {
    configureI18n({ locales: ["en", "fr", "pl"], defaultLocale: "en" });
    createI18n({ locales: ["en", "fr", "pl"], defaultLocale: "en", messages });
  });

  test("interpolates and tracks the active locale", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("greeting", { name: "Ada" })).toBe("Hello, Ada");
    setLocale("fr");
    expect(t("greeting", { name: "Ada" })).toBe("Bonjour, Ada");
  });

  test("ICU plurals — English", () => {
    setLocale("en");
    expect(t("cart.items", { count: 1 })).toBe("1 item");
    expect(t("cart.items", { count: 5 })).toBe("5 items");
  });

  test("ICU plurals — Polish (3-form)", () => {
    setLocale("pl");
    expect(t("files", { count: 1 })).toBe("1 plik");
    expect(t("files", { count: 3 })).toBe("3 pliki");
    expect(t("files", { count: 7 })).toBe("7 plików");
  });

  test("dotted-nested key, fallback to default locale, missing → key", () => {
    setLocale("en");
    expect(t("nested.hi")).toBe("Hi");
    setLocale("fr"); // fr has no nested.hi → falls back to en
    expect(t("nested.hi")).toBe("Hi");
    expect(t("totally.missing")).toBe("totally.missing");
  });

  test("replacing a catalog drops its compiled messages", () => {
    setLocale("en");
    expect(t("greeting", { name: "Ada" })).toBe("Hello, Ada");
    setCatalog("en", { greeting: "Hi there, {name}" });
    expect(t("greeting", { name: "Ada" })).toBe("Hi there, Ada");
  });

  test("replacing the default catalog updates fallbacks cached by other locales", () => {
    setLocale("fr");
    setCatalog("en", { ...messages.en, wave: "Wave {n}" });
    expect(t("wave", { n: 1 })).toBe("Wave 1"); // fr falls back to en
    setCatalog("en", { ...messages.en, wave: "Waves {n}" });
    expect(t("wave", { n: 1 })).toBe("Waves 1");
  });
});

describe("afw-i18n lazy catalogs", () => {
  test("a loaded catalog replaces messages compiled from the fallback", async () => {
    configureI18n({ locales: ["en", "de"], defaultLocale: "en" });
    createI18n({
      locales: ["en", "de"],
      defaultLocale: "en",
      messages: { en: { greeting: "Hello, {name}" } },
      load: async (locale) => ({ default: { greeting: `Hallo, {name} (${locale})` } }),
    });
    setLocale("de");
    expect(t("greeting", { name: "Ada" })).toBe("Hello, Ada"); // de not loaded yet
    await loadLocale("de");
    expect(t("greeting", { name: "Ada" })).toBe("Hallo, Ada (de)");
  });
});

describe("afw-i18n fmt", () => {
  beforeEach(() => {
    configureI18n({ locales: ["en", "fr"], defaultLocale: "en" });
    createI18n({ locales: ["en", "fr"], defaultLocale: "en", messages });
  });

  test("number + currency per active locale", () => {
    setLocale("en");
    expect(fmt.number(1234.5)).toBe("1,234.5");
    expect(fmt.currency(189, "USD")).toBe("$189.00");
  });

  test("plural category + relativeTime", () => {
    setLocale("en");
    expect(fmt.plural(1)).toBe("one");
    expect(fmt.plural(2)).toBe("other");
    expect(fmt.relativeTime(-3, "day")).toBe("3 days ago");
  });
});

describe("afw-i18n <html lang> mirror", () => {
  test("tracks the active locale", () => {
    configureI18n({ locales: ["en", "fr"], defaultLocale: "en" });
    createI18n({ locales: ["en", "fr"], defaultLocale: "en", messages });
    setLocale("en");
    expect(document.documentElement.lang).toBe("en");
    setLocale("fr");
    expect(document.documentElement.lang).toBe("fr");
  });
});
