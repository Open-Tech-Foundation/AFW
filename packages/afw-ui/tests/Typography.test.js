// Typography: the element carries the meaning, data-* the look; links, code and keys.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import { ClickLink, CodeBits, Header, Headings, Links, Texts } from "./fixtures/TypographyDemo.jsx";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Heading", () => {
  test("level picks the element, size only the look (default by level)", async () => {
    const view = render(Headings);
    await tick();
    const h1 = view.getByTestId("h1");
    expect([h1.tagName, h1.dataset.size, h1.className]).toEqual(["H1", "2xl", "afw-ui-heading"]);
    expect([view.getByTestId("h3").tagName, view.getByTestId("h3").dataset.size]).toEqual(["H3", "sm"]);
    expect([view.getByTestId("default").tagName, view.getByTestId("default").dataset.size]).toEqual(["H2", "xl"]);
    expect(view.getByTestId("clamped").tagName).toBe("H6"); // out of range clamps into h1–h6
    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Billing");
  });

  test("a new level swaps the element and keeps its text and attributes", async () => {
    const view = render(Headings);
    await tick();
    const host = view.getByTestId("live").parentElement;
    host.level = 4;
    await tick();
    const live = view.getByTestId("live");
    expect([live.tagName, live.dataset.size, live.textContent]).toEqual(["H4", "md", "Live"]);
  });

  test("PageHeader's title is a level-1 Heading", async () => {
    const view = render(Header);
    await tick();
    const title = view.getByRole("heading", { level: 1 });
    expect(title.classList.contains("afw-ui-heading") && title.classList.contains("afw-ui-page-title")).toBe(true);
    expect(title.textContent).toBe("Atlas");
  });
});

describe("Text", () => {
  test("a paragraph by default; as, tone, size and weight as hooks", async () => {
    const view = render(Texts);
    await tick();
    expect(view.getByTestId("p").tagName).toBe("P");
    const span = view.getByTestId("span");
    expect([span.tagName, span.dataset.tone, span.dataset.size, span.dataset.weight]).toEqual(["SPAN", "muted", "sm", "semibold"]);
    expect(span.hasAttribute("data-truncate")).toBe(false);
  });

  test("truncate and lines are visual: the full text stays", async () => {
    const view = render(Texts);
    await tick();
    const cut = view.getByTestId("truncate");
    expect([cut.tagName, cut.hasAttribute("data-truncate"), cut.textContent]).toEqual(["DIV", true, "quarterly-report-final-v2.pdf"]);
    const lines = view.getByTestId("lines");
    expect(lines.dataset.lines).toBe("2");
    expect(lines.style.getPropertyValue("--afw-ui-lines").trim()).toBe("2");
  });
});

describe("TextLink", () => {
  test("an app path stays in the app; protocol-relative is not an app path", async () => {
    const view = render(Links);
    await tick();
    const app = view.getByTestId("app");
    expect([app.getAttribute("href"), app.hasAttribute("target"), app.className]).toEqual(["/settings", false, "afw-ui-link"]);
    expect(view.getByTestId("protocol").getAttribute("href")).toBe("//cdn.example.com/a");
  });

  test("external: a new tab, said out loud, with no opener", async () => {
    const view = render(Links);
    await tick();
    const ext = view.getByTestId("external");
    expect([ext.getAttribute("target"), ext.getAttribute("rel"), ext.hasAttribute("data-external")]).toEqual(["_blank", "noopener noreferrer", true]);
    expect(view.getByRole("link", { name: "Status page (opens in a new tab)" })).toBe(ext);
  });

  test("your onclick still runs", async () => {
    const spy = { clicks: 0 };
    const view = render(ClickLink, { spy });
    await tick();
    view.getByRole("link", { name: "Site" }).click();
    expect(spy.clicks).toBe(1);
  });
});

describe("Code and keys", () => {
  test("inline code, a key, and a key combination in the HTML form", async () => {
    const view = render(CodeBits);
    await tick();
    expect(view.getByTestId("code").tagName).toBe("CODE");
    const kbd = view.getByTestId("kbd");
    expect([kbd.tagName, kbd.textContent, kbd.hasAttribute("data-combo")]).toEqual(["KBD", "Esc", false]);
    const combo = view.getByTestId("combo");
    expect(combo.hasAttribute("data-combo")).toBe(true);
    expect([...combo.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Ctrl", "K"]);
    expect(combo.textContent).toBe("Ctrl+K");
  });

  test("a code block is a named tab stop that keeps its language hook", async () => {
    const view = render(CodeBits);
    await tick();
    const block = view.getByTestId("block");
    expect([block.tagName, block.getAttribute("tabindex"), block.dataset.language]).toEqual(["PRE", "0", "sh"]);
    expect(view.getByRole("group", { name: "Install" })).toBe(block);
    expect(block.querySelector("code").className).toBe("language-sh");
  });
});
