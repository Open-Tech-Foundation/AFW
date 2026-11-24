// Real-browser suite for @opentf/afw-ui: a prerendered (SSG) page in headless Chromium,
// driven with trusted keyboard and pointer input over the DevTools protocol.
//
// Why it exists: the unit suites run in esdev's DOM realm, which has no invoker
// commands, focusgroup, interest invokers or anchor positioning — so they only ever test
// our fallbacks — and it delivers custom-element reactions differently from a browser.
// The kit once passed every unit test while Chrome lost a dialog's context, never fired
// `onfocusout`, and left a menu at 0,0. This suite drives the native paths, and the
// server-render → adopt path no unit test reaches:
//
//   1. Server HTML works before any script: an invoker trigger opens its dialog.
//   2. Hydration adopts the server DOM: no kit node is replaced, ids are unchanged,
//      nothing is logged.
//   3. Keyboard and pointer behavior on the native platform features.
//
//   esdev packages/afw-ui/e2e/run.mjs
//
// Builds the fixture with `esdev build --config=esdev.ui-kit.json` (prerender included),
// serves packages/afw-ui/e2e/dist, and needs Chromium (CHROME_BIN overrides) and the
// workspace afwc build (AFWC_BIN overrides). Exits 1 on any failed assertion.

import { launchChrome } from "../../afw-docs/tests/e2e/chrome.js";
import { exists, file } from "runtime:fs";
import { serve } from "runtime:http";
import { dirname, extname, fromFileURL, join, normalize } from "runtime:path";
import { env, exit } from "runtime:process";
import { Command } from "runtime:system";

const HERE = dirname(fromFileURL(import.meta.url));
const ROOT = dirname(dirname(dirname(HERE)));
const DIST = join(HERE, "dist");
const AFWC = env.AFWC_BIN || join(ROOT, "target/debug/afwc");
const CHROME = env.CHROME_BIN || "/usr/bin/chromium";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`    ✗ ${label}${detail === undefined ? "" : `  — ${JSON.stringify(detail)}`}`);
  }
}

// ── Build ─────────────────────────────────────────────────────────────────────
if (!(await exists(AFWC))) {
  console.error(`✗ no afwc at ${AFWC} (run \`cargo build\` first)`);
  exit(1);
}
console.log("• building the fixture (SSG)…");
const built = await new Command("esdev", {
  args: ["build", "--config=esdev.ui-kit.json"],
  cwd: ROOT,
  env: { AFWC_BIN: AFWC },
  stdout: "piped",
  stderr: "piped",
}).output();
if (!built.success) {
  console.error(new TextDecoder().decode(built.stdout) + new TextDecoder().decode(built.stderr));
  console.error("✗ fixture build failed");
  exit(1);
}

// ── Serve dist ────────────────────────────────────────────────────────────────
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain" };
const server = serve({ hostname: "127.0.0.1", port: 0 }, async (request) => {
  let path = decodeURIComponent(new URL(request.url).pathname);
  if (path.endsWith("/")) path += "index.html";
  const target = normalize(join(DIST, path));
  if (!target.startsWith(DIST) || !(await exists(target))) return new Response("not found", { status: 404 });
  return new Response(file(target).stream(), { headers: { "content-type": TYPES[extname(target)] ?? "application/octet-stream" } });
});
const origin = `http://127.0.0.1:${(await server.addr).port}`;

// ── CDP ───────────────────────────────────────────────────────────────────────
const chrome = await launchChrome(CHROME, ["--hide-scrollbars", "--window-size=1100,900"]);
async function connect() {
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json`)).json();
    } catch {
      await sleep(100);
    }
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const m = ++id;
      pending.set(m, { res, rej });
      ws.send(JSON.stringify({ id: m, method, params }));
    });
  return { send, close: () => ws.close() };
}
const cdp = await connect();
const js = async (expression) => {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
const until = async (expression, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js(expression)) return true;
    await sleep(25);
  }
  return false;
};

// Trusted input: what a person's keyboard and mouse send, so the browser runs its native
// behavior (invoker commands, focusgroup arrows, interest, light dismiss).
const KEYS = {
  Enter: { code: "Enter", keyCode: 13, text: "\r" },
  " ": { code: "Space", keyCode: 32, text: " " },
  Escape: { code: "Escape", keyCode: 27 },
  Tab: { code: "Tab", keyCode: 9 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  End: { code: "End", keyCode: 35 },
  Home: { code: "Home", keyCode: 36 },
};
async function press(key) {
  const k = KEYS[key];
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: k.code, windowsVirtualKeyCode: k.keyCode, text: k.text });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.keyCode });
  await sleep(60);
}
async function center(selector) {
  return js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
}
async function click(selector) {
  const { x, y } = await center(selector);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(80);
}
const active = () => js(`(document.activeElement?.id || document.activeElement?.textContent || "").trim()`);

// At document start: tag every node the parser inserts (a rebuilt subtree drops them),
// remember the server ids, and collect anything logged.
const OBSERVER = `
  window.__removed = [];
  window.__errors = [];
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) if (!window.__parsed && !n.__server) n.__server = true;
      for (const n of r.removedNodes) if (n.__server && n.nodeType === 1 && (n.className || "").toString().includes("afw-ui-")) window.__removed.push(n.className);
    }
  }).observe(document, { childList: true, subtree: true }); // no documentElement yet at document start
  document.addEventListener("readystatechange", () => {
    if (document.readyState !== "interactive") return;
    window.__parsed = true;
    window.__serverIds = [...document.querySelectorAll("[id^='afw-']")].map((el) => el.id);
  });
  addEventListener("error", (e) => window.__errors.push(String(e.message)));
  addEventListener("afw:error", (e) => window.__errors.push(String(e.detail && e.detail.error)));
  const ce = console.error;
  console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); ce(...a); };
`;

async function load({ scripts = true, path = "/" } = {}) {
  await cdp.send("Emulation.setScriptExecutionDisabled", { value: !scripts });
  await cdp.send("Page.navigate", { url: `${origin}${path}` });
  await until(`document.readyState === "complete"`, 5000);
  // Hydrated: the tooltip (/) or the shell's layout (/shell) is set on mount.
  if (scripts) {
    await until(
      path === "/"
        ? `!!document.querySelector("#share")?.getAttribute("aria-describedby")`
        : `!!window.__afwShellReady || document.querySelector(".afw-ui-shell-sidebar")?.isConnected && document.readyState === "complete"`,
      5000,
    );
  }
  await sleep(150);
}
const viewport = (width, height = 900) =>
  cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

// ── Run ───────────────────────────────────────────────────────────────────────
try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVER });

  console.log("\n▶ hydration");
  await load();
  const hydration = await js(`(() => {
    const dialog = document.querySelector("dialog.afw-ui-dialog");
    const ids = [...document.querySelectorAll("[id^='afw-']")].map((el) => el.id);
    return {
      removed: window.__removed, errors: window.__errors,
      dialogAdopted: !!dialog.__server, tabAdopted: !!document.querySelector(".afw-ui-tab").__server,
      idsKept: (window.__serverIds || []).every((id) => ids.includes(id)), serverIds: (window.__serverIds || []).length,
      commandfor: document.querySelector(".afw-ui-dialog-trigger").getAttribute("commandfor") === dialog.id,
    };
  })()`);
  check(hydration.removed.length === 0, "no server-rendered kit node was replaced", hydration.removed);
  check(hydration.dialogAdopted && hydration.tabAdopted, "the dialog and tabs are the server nodes");
  check(hydration.idsKept && hydration.serverIds > 0, "every server id is still there", hydration.serverIds);
  check(hydration.commandfor, "trigger and dialog still agree after hydration");
  check(hydration.errors.length === 0, "nothing logged", hydration.errors);

  console.log("\n▶ server HTML, before any script");
  await load({ scripts: false });
  const server = await js(`(() => {
    const trigger = document.querySelector(".afw-ui-dialog-trigger");
    const dialog = document.querySelector("dialog.afw-ui-dialog");
    const tabs = [...document.querySelectorAll(".afw-ui-tab")];
    const panels = [...document.querySelectorAll(".afw-ui-tab-panel")];
    const label = document.querySelector(".afw-ui-field-label");
    const input = document.querySelector("input[name=email]");
    return {
      commandfor: trigger.getAttribute("commandfor"), dialogId: dialog.id,
      labelledby: dialog.getAttribute("aria-labelledby"), title: document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,
      selected: tabs.map((t) => t.getAttribute("aria-selected")), hidden: panels.map((p) => p.getAttribute("hidden")),
      panelLabels: panels.map((p, i) => p.getAttribute("aria-labelledby") === tabs[i].id),
      labelFor: label.getAttribute("for") === input.id, described: input.getAttribute("aria-describedby"),
      uidHosts: document.querySelectorAll("[data-afw-uid]").length,
    };
  })()`);
  check(server.commandfor && server.commandfor === server.dialogId, "the trigger's commandfor names the dialog", server);
  check(server.title === "Delete this project?", "the dialog is named by its title");
  check(JSON.stringify(server.selected) === '["false","true","false"]', "the default tab is selected in the HTML", server.selected);
  check(JSON.stringify(server.hidden) === '["until-found",null,"until-found"]', "other panels are hidden until found", server.hidden);
  check(server.panelLabels.every(Boolean), "each panel is labelled by its tab");
  check(server.labelFor && !!server.described, "the field label and description are linked");
  check(server.uidHosts > 0, "hosts carry their $id base (data-afw-uid)", server.uidHosts);
  await click(".afw-ui-dialog-trigger");
  check(await until(`document.querySelector("dialog.afw-ui-dialog").matches(":modal")`), "the trigger opens the dialog with no script (invoker)");

  await load(); // scripts back on for the interaction checks
  console.log("\n▶ dialog (keyboard)");
  await js(`document.querySelector(".afw-ui-dialog-trigger").focus()`);
  await press("Enter");
  check(await until(`document.querySelector("dialog.afw-ui-dialog").matches(":modal")`), "Enter on the trigger opens it as a modal");
  check((await active()) === "keep", "focus moves to the autofocus button", await active());
  await press("Escape");
  check(await until(`!document.querySelector("dialog.afw-ui-dialog").open`), "Esc closes it");
  check((await active()) === "dialog-trigger", "focus returns to the trigger", await active());

  console.log("\n▶ menu (keyboard, native focusgroup)");
  await js(`document.querySelector(".afw-ui-menu-trigger").focus()`);
  await press("Enter");
  check(await until(`document.querySelector(".afw-ui-menu").matches(":popover-open")`), "Enter opens the menu");
  check((await active()) === "Rename", "a keyboard open focuses the first item", await active());
  check((await js(`document.querySelector(".afw-ui-menu-trigger").getAttribute("aria-expanded")`)) === "true", "the trigger is expanded");
  await press("ArrowDown");
  check((await active()) === "Duplicate", "ArrowDown moves to the next item", await active());
  await press("End");
  check((await active()) === "Archive", "End moves to the last item", await active());
  const place = await js(`(() => { const t = document.querySelector(".afw-ui-menu-trigger").getBoundingClientRect(); const m = document.querySelector(".afw-ui-menu").getBoundingClientRect(); return { dy: Math.round(m.top - t.bottom), dx: Math.round(m.left - t.left) }; })()`);
  check(place.dy >= 0 && place.dy <= 8 && Math.abs(place.dx) <= 1, "it sits just below its trigger, aligned to its start", place);
  await press("Escape");
  check(await until(`!document.querySelector(".afw-ui-menu").matches(":popover-open")`), "Esc closes it");
  check((await js(`document.activeElement.classList.contains("afw-ui-menu-trigger")`)), "focus returns to the trigger");

  console.log("\n▶ tabs (keyboard, native focusgroup)");
  await js(`document.querySelector(".afw-ui-tab[aria-selected=true]").focus()`);
  await press("ArrowRight");
  const tabs = await js(`({ focus: document.activeElement.textContent, selected: document.querySelector(".afw-ui-tab[aria-selected=true]").textContent, shown: [...document.querySelectorAll(".afw-ui-tab-panel")].filter((p) => !p.hidden).map((p) => p.textContent) })`);
  check(tabs.focus === "Members" && tabs.selected === "Members", "ArrowRight moves to and selects the next tab", tabs);
  check(JSON.stringify(tabs.shown) === '["Members panel"]', "only its panel shows", tabs.shown);
  await press("Home");
  check((await js(`document.querySelector(".afw-ui-tab[aria-selected=true]").textContent`)) === "Overview", "Home selects the first tab");

  console.log("\n▶ tooltip (interest from keyboard focus)");
  await js(`document.querySelector(".afw-ui-popover-trigger").focus()`);
  await press("Tab");
  check((await active()) === "share", "Tab reaches the tooltip's trigger", await active());
  check(await until(`document.querySelector(".afw-ui-tooltip").matches(":popover-open")`, 2000), "keyboard focus opens the tooltip");
  const tip = await js(`(() => { const t = document.querySelector("#share").getBoundingClientRect(); const h = document.querySelector(".afw-ui-tooltip").getBoundingClientRect(); return { above: h.bottom <= t.top + 1 }; })()`);
  check(tip.above, "it sits above its trigger", tip);
  await press("Escape");
  check(await until(`!document.querySelector(".afw-ui-tooltip").matches(":popover-open")`), "Esc dismisses it");

  console.log("\n▶ popover (pointer)");
  await click(".afw-ui-popover-trigger");
  check(await until(`document.querySelector(".afw-ui-popover").matches(":popover-open")`), "a click opens it");
  check((await js(`document.querySelector(".afw-ui-popover-trigger").getAttribute("aria-expanded")`)) === "true", "the trigger reports expanded");
  // Far from the panel: bottom-left of the viewport.
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 10, y: 880, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 10, y: 880, button: "left", clickCount: 1 });
  check(await until(`!document.querySelector(".afw-ui-popover").matches(":popover-open")`), "a click outside closes it (light dismiss)");
  check(await until(`document.querySelector(".afw-ui-popover-trigger").getAttribute("aria-expanded") === "false"`), "the trigger follows");

  console.log("\n▶ combobox (typing)");
  check((await js(`document.querySelector("[role=combobox]").value`)) === "Banana", "the chosen option's label is the text");
  await js(`(() => { const i = document.querySelector("[role=combobox]"); i.focus(); i.select(); })()`);
  await cdp.send("Input.insertText", { text: "ap" });
  check(await until(`document.querySelector(".afw-ui-combobox-popup").matches(":popover-open")`), "typing opens the list");
  const typed = await js(`(() => { const i = document.querySelector("[role=combobox]").getBoundingClientRect(); const p = document.querySelector(".afw-ui-combobox-popup").getBoundingClientRect(); return { options: [...document.querySelectorAll("[role=option]")].map((o) => o.textContent), below: p.top >= i.bottom - 1 && p.top - i.bottom <= 8, wide: p.width >= i.width - 1 }; })()`);
  check(JSON.stringify(typed.options) === '["Apple","Apricot","Grape"]', "and filters it", typed.options);
  check(typed.below && typed.wide, "the list sits under the input, at least as wide", typed);
  await press("ArrowDown");
  check((await js(`document.getElementById(document.querySelector("[role=combobox]").getAttribute("aria-activedescendant"))?.textContent`)) === "Apple", "ArrowDown highlights the first option");
  await press("Enter");
  const chosen = await js(`({ text: document.querySelector("[role=combobox]").value, hidden: document.querySelector("input[name=fruit]").value, open: document.querySelector(".afw-ui-combobox-popup").matches(":popover-open"), focus: document.activeElement.getAttribute("role") })`);
  check(chosen.text === "Apple" && chosen.hidden === "apple" && !chosen.open, "Enter chooses it and closes the list", chosen);
  check(chosen.focus === "combobox", "focus stays in the input");

  console.log("\n▶ toast");
  await click("#first");
  check(await until(`document.querySelector(".afw-ui-toaster")?.matches(":popover-open")`), "a toast shows its region");
  check((await js(`document.querySelector(".afw-ui-toast-message")?.textContent`)) === "Saved", "with the message");

  console.log("\n▶ app shell: server HTML");
  await load({ scripts: false, path: "/shell/" });
  const shellHTML = await js(`(() => {
    const main = document.querySelector("main");
    const skip = document.querySelector(".afw-ui-skip-link");
    return {
      skip: skip?.getAttribute("href") === "#" + main?.id,
      current: [...document.querySelectorAll(".afw-ui-sidenav-item[aria-current=page]")].map((a) => a.textContent),
      crumb: document.querySelector(".afw-ui-breadcrumbs-link[aria-current=page]")?.textContent,
      banner: !!document.querySelector("header.afw-ui-shell-header"), navs: [...document.querySelectorAll("nav")].map((n) => n.getAttribute("aria-label")),
    };
  })()`);
  check(shellHTML.skip, "a skip link targets <main>");
  check(JSON.stringify(shellHTML.current) === '["App shell"]', "the route's page is aria-current in the server HTML", shellHTML.current);
  check(shellHTML.crumb === "App shell", "the last breadcrumb is the current page");
  check(shellHTML.banner && JSON.stringify(shellHTML.navs) === '["Main","Breadcrumbs"]', "header, main and breadcrumb navigation landmarks", shellHTML.navs);

  console.log("\n▶ app shell: wide");
  await viewport(1100);
  await load({ path: "/shell/" });
  const wide = await js(`(() => { const s = document.querySelector(".afw-ui-shell-sidebar").getBoundingClientRect(); return { layout: document.querySelector(".afw-ui-shell").dataset.layout, sidebar: s.width > 100 && s.height > 100, menu: document.querySelector(".afw-ui-shell-menu-button").hidden, popover: document.querySelector(".afw-ui-shell-sidebar").hasAttribute("popover"), errors: window.__errors }; })()`);
  check(wide.layout === "sidebar" && wide.sidebar && !wide.popover, "the sidebar is a visible column", wide);
  check(wide.menu, "no menu button");
  check(wide.errors.length === 0, "nothing logged", wide.errors);
  await press("Tab");
  check(await js(`document.activeElement.classList.contains("afw-ui-skip-link")`), "Tab reaches the skip link first");
  await press("Enter");
  check(await until(`document.activeElement?.tagName === "MAIN"`), "Enter on it moves focus to main");

  console.log("\n▶ app shell: narrow (drawer)");
  await viewport(600);
  await load({ path: "/shell/" });
  check(await until(`document.querySelector(".afw-ui-shell").dataset.layout === "drawer"`), "a narrow screen switches to the drawer layout");
  await sleep(300); // the switch hides the sidebar through a short display transition
  const narrow = await js(`({ menu: !document.querySelector(".afw-ui-shell-menu-button").hidden, role: document.querySelector(".afw-ui-shell-sidebar").getAttribute("role"), shown: document.querySelector(".afw-ui-shell-sidebar").checkVisibility() })`);
  check(narrow.menu && narrow.role === "dialog" && !narrow.shown, "the menu button shows; the sidebar is a hidden dialog", narrow);
  await js(`document.querySelector(".afw-ui-shell-menu-button").focus()`);
  await press("Enter");
  check(await until(`document.querySelector(".afw-ui-shell-sidebar").matches(":popover-open")`), "Enter on the menu button opens the drawer");
  const opened = await js(`({ modal: document.querySelector(".afw-ui-shell-sidebar").getAttribute("aria-modal"), inert: document.querySelector("main").inert, focus: document.querySelector(".afw-ui-shell-sidebar").contains(document.activeElement), x: Math.round(document.querySelector(".afw-ui-shell-sidebar").getBoundingClientRect().left) })`);
  check(opened.modal === "true" && opened.inert && opened.focus, "it is modal: the page is inert and focus is inside", opened);
  await press("Escape");
  check(await until(`!document.querySelector(".afw-ui-shell-sidebar").matches(":popover-open")`), "Esc closes it");
  check(await js(`document.activeElement.classList.contains("afw-ui-shell-menu-button") && !document.querySelector("main").inert`), "focus returns to the menu button; the page is live again");
  await viewport(1100);

  const late = await js(`window.__errors`);
  check(late.length === 0, "nothing logged during the session", late);
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.log(`    ✗ ${error?.stack ?? error}`);
} finally {
  cdp.close();
  await chrome.kill();
  await server.shutdown?.();
}

console.log(`\n${failures.length ? "✗" : "✓"} afw-ui browser suite: ${passed} passed, ${failures.length} failed`);
exit(failures.length ? 1 : 0);
