// Hydration failures that used to pass silently: a lost props payload (islands fell back
// to their default props) and an adopted text hole whose server text differs.
import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import { resetWarnings } from "../core/dev.js";
import { onError } from "../core/errors.js";
import { signal } from "../core/signals.js";
import { bindText } from "./dom.js";
import { HydrationPayloadError, __resetHydrationPayload, claimText, cursor, hydrationProps } from "./hydrate.js";

let reported, off;
beforeEach(() => {
  reported = [];
  off = onError((error, context) => reported.push({ error, context }));
  __resetHydrationPayload();
  document.getElementById("__afw_h")?.remove();
});
afterEach(() => {
  off();
  document.body.replaceChildren();
  document.getElementById("__afw_h")?.remove();
  __resetHydrationPayload();
});

function payload(text) {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "__afw_h";
  script.textContent = text;
  document.body.append(script);
}
function island(id) {
  const el = document.createElement("x-badge");
  if (id != null) el.setAttribute("data-h", String(id));
  return el;
}

describe("a lost hydration payload", () => {
  test("an island's props come from the payload, with nothing reported", () => {
    payload('[{"text":"hi"}]');
    expect(hydrationProps(island(0))).toEqual({ text: "hi" });
    expect(reported).toEqual([]);
  });

  test("no payload script: reported once per page, naming the island", () => {
    expect(hydrationProps(island(0))).toBe(null);
    expect(hydrationProps(island(1))).toBe(null);
    expect(reported.length).toBe(1);
    const { error, context } = reported[0];
    expect(error).toBeInstanceOf(HydrationPayloadError);
    expect(error.reason).toBe("missing");
    expect(error.id).toBe(0);
    expect(error.message).toContain('<x-badge data-h="0">');
    expect(context.phase).toBe("hydration");
  });

  test("an unreadable payload and a missing entry are told apart", () => {
    payload("[{");
    hydrationProps(island(0));
    expect(reported[0].error.reason).toBe("unreadable");
    reported = [];
    document.getElementById("__afw_h").remove();
    __resetHydrationPayload();
    payload('[{"a":1}]');
    hydrationProps(island(3));
    expect(reported[0].error.reason).toBe("entry");
    expect(reported[0].error.message).toContain("no entry 3");
  });

  test("an element the server never gave props (no data-h) is not a loss", () => {
    expect(hydrationProps(island(null))).toBe(null);
    expect(reported).toEqual([]);
  });
});

describe("an adopted text hole with different text", () => {
  let warnings, realWarn;
  beforeEach(() => {
    resetWarnings();
    warnings = [];
    realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
  });
  afterEach(() => {
    console.warn = realWarn;
  });

  const hole = (text) => {
    const p = document.createElement("p");
    p.innerHTML = `<!--$-->${text}<!--/-->`;
    return claimText(cursor(p));
  };

  test("warns once, with both texts, and shows the client's", () => {
    const node = hole("Count 3");
    bindText(node, () => "Count 4");
    expect(node.data).toBe("Count 4");
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('"Count 3"');
    expect(warnings[0]).toContain('"Count 4"');
    bindText(hole("a"), () => "b");
    expect(warnings.length).toBe(1);
  });

  test("matching text adopts silently", () => {
    const node = hole("same");
    bindText(node, () => "same");
    expect(warnings).toEqual([]);
  });

  test("a later update is not a mismatch", () => {
    const n = signal("1");
    const node = hole("1");
    bindText(node, () => n.value);
    n.value = "2";
    expect(node.data).toBe("2");
    expect(warnings).toEqual([]);
  });
});
