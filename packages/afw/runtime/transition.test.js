import { describe, expect, test } from "runtime:test";

import { onError } from "../core/errors.js";
import { signal } from "../core/signals.js";
import { bindChild, bindList, hydrateChild } from "./dom.js";
import { claimElement, cursor } from "./hydrate.js";
import { fade, fly, scale, setTransition, slide } from "./transition.js";

/** A controllable stand-in for a Web Animation: settles when the test says so. */
function fakeAnimation(keyframes, options) {
  let finish;
  const animation = {
    keyframes, options, reversed: false, cancelled: false,
    finished: new Promise((resolve, reject) => { finish = { resolve, reject }; }),
    end() { finish.resolve(animation); },
    reverse() { animation.reversed = true; },
    cancel() { animation.cancelled = true; finish.reject(new Error("cancelled")); },
  };
  return animation;
}

/** Give `el` a recording `animate()`; returns the list of animations it started. */
function recordAnimations(el) {
  const started = [];
  el.animate = (keyframes, options) => {
    const a = fakeAnimation(keyframes, options);
    started.push(a);
    return a;
  };
  return started;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** `{show && <p transition={spec}>}` built by hand, as the compiler emits it. */
function conditional(show, spec, kind = "both") {
  const parent = document.createElement("div");
  const anchor = document.createComment("");
  parent.appendChild(anchor);
  const made = [];
  bindChild(anchor, () => {
    if (!show.value) return null;
    const p = document.createElement("p");
    p.textContent = "hi";
    made.push({ el: p, animations: recordAnimations(p) });
    setTransition(p, kind, spec);
    return p;
  });
  return { parent, made };
}

describe("conditional regions", () => {
  test("an exit transition keeps the node, inert, until its animation ends", async () => {
    const show = signal(true);
    const { parent, made } = conditional(show, fade());
    const [{ el, animations }] = made;
    show.value = false;
    expect(el.parentNode).toBe(parent);
    expect(el.inert).toBe(true);
    const out = animations.at(-1);
    expect(out.options.direction).toBe("reverse");
    expect(out.options.fill).toBe("forwards");
    expect(out.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    out.end();
    await flush();
    expect(el.parentNode).toBe(null);
  });

  test("the first render does not play the enter; later inserts do", () => {
    const show = signal(true);
    const { made } = conditional(show, fade());
    expect(made[0].animations).toHaveLength(0);
    show.value = false;
    show.value = true;
    const entering = made[1].animations;
    expect(entering).toHaveLength(1);
    expect(entering[0].options.direction).toBe("normal");
    expect(entering[0].options.fill).toBe("backwards");
  });

  test("`initial: true` plays the enter on the first render too", () => {
    const { made } = conditional(signal(true), fade({ initial: true }));
    expect(made[0].animations).toHaveLength(1);
  });

  test("the incoming branch is inserted while the outgoing one leaves", () => {
    const show = signal(true);
    const { parent, made } = conditional(show, fade());
    show.value = false;
    show.value = true;
    expect([...parent.querySelectorAll("p")]).toEqual([made[0].el, made[1].el]);
  });

  test("leaving mid-enter reverses the running enter", () => {
    const show = signal(false);
    const { made } = conditional(show, fade());
    show.value = true;
    const [enter] = made[0].animations;
    show.value = false;
    expect(enter.reversed).toBe(true);
    expect(made[0].animations).toHaveLength(1); // no second animation
  });

  test("`in` only animates entering; the node is removed at once", () => {
    const show = signal(false);
    const { parent, made } = conditional(show, fade(), "in");
    show.value = true;
    expect(made[0].animations).toHaveLength(1);
    show.value = false;
    expect(made[0].el.parentNode).toBe(null);
    expect(parent.querySelector("p")).toBe(null);
  });

  test("`out` only animates leaving", () => {
    const show = signal(false);
    const { made } = conditional(show, fade(), "out");
    show.value = true;
    expect(made[0].animations).toHaveLength(0);
    show.value = false;
    expect(made[0].animations).toHaveLength(1);
  });

  test("a nullish transition and an element without one are removed at once", () => {
    const show = signal(true);
    const { made } = conditional(show, null);
    show.value = false;
    expect(made[0].el.parentNode).toBe(null);
  });

  test("no Web Animations support removes the node at once", () => {
    const show = signal(true);
    const parent = document.createElement("div");
    const anchor = parent.appendChild(document.createComment(""));
    let p;
    bindChild(anchor, () => {
      if (!show.value) return null;
      p = document.createElement("p");
      p.animate = undefined;
      setTransition(p, "both", fade());
      return p;
    });
    show.value = false;
    expect(p.parentNode).toBe(null);
  });

  test("a transition that throws is reported and the node still leaves", () => {
    const errors = [];
    const off = onError((error, context) => errors.push(context.phase));
    const show = signal(true);
    const { made } = conditional(show, () => { throw new Error("boom"); });
    show.value = false;
    off();
    expect(errors).toEqual(["transition"]);
    expect(made[0].el.parentNode).toBe(null);
  });

  test("a non-function transition is reported", () => {
    const errors = [];
    const off = onError((error) => errors.push(error.message));
    const el = document.createElement("p");
    setTransition(el, "both", "fade");
    off();
    expect(errors[0]).toContain("expects a transition function");
  });

  test("a custom transition can return any thenable", async () => {
    let resolve;
    const custom = () => new Promise((r) => { resolve = r; });
    const show = signal(true);
    const { made } = conditional(show, custom);
    show.value = false;
    expect(made[0].el.isConnected || made[0].el.parentNode).toBeTruthy();
    resolve();
    await flush();
    expect(made[0].el.parentNode).toBe(null);
  });

  test("prefers-reduced-motion skips every animation", () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (query) => ({ matches: query.includes("reduce") });
    try {
      const show = signal(true);
      const { made } = conditional(show, fade());
      show.value = false;
      expect(made[0].animations).toHaveLength(0);
      expect(made[0].el.parentNode).toBe(null);
    } finally {
      globalThis.matchMedia = original;
    }
  });

  test("a hydrated region does not play the enter for its adopted branch", () => {
    // Server HTML: <!--[--><p>hi</p><!--]-->
    const parent = document.createElement("div");
    parent.innerHTML = "<!--[--><p>hi</p><!--]-->";
    const show = signal(true);
    const adopted = parent.querySelector("p");
    const animations = recordAnimations(adopted);
    const cur = cursor(parent);
    const built = [];
    hydrateChild(
      cur,
      (c) => {
        const p = claimElement(c, "p");
        setTransition(p, "both", fade());
        return p;
      },
      () => {
        if (!show.value) return null;
        const p = document.createElement("p");
        built.push(recordAnimations(p));
        setTransition(p, "both", fade());
        return p;
      },
      () => (show.value ? null : null),
    );
    expect(animations).toHaveLength(0);
    show.value = false;
    expect(animations).toHaveLength(1); // the adopted node animates out
    show.value = true;
    expect(built.at(-1)).toHaveLength(1); // a later insert animates in
  });
});

describe("keyed lists", () => {
  function list(items, spec) {
    const parent = document.createElement("ul");
    const nodes = new Map();
    bindList(
      parent,
      () => items.value,
      (sig) => {
        const li = document.createElement("li");
        li.textContent = sig.value.id;
        nodes.set(sig.value.id, { el: li, animations: recordAnimations(li) });
        setTransition(li, "both", spec);
        return li;
      },
      (item) => item.id,
    );
    return { parent, nodes };
  }

  test("only items added after the first render play the enter", () => {
    const items = signal([{ id: 1 }, { id: 2 }]);
    const { nodes } = list(items, fade());
    expect(nodes.get(1).animations).toHaveLength(0);
    items.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(nodes.get(3).animations).toHaveLength(1);
    expect(nodes.get(1).animations).toHaveLength(0); // kept items don't re-enter
  });

  test("a removed item leaves in place and the rest keep their order", async () => {
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const { parent, nodes } = list(items, fade());
    items.value = [{ id: 1 }, { id: 3 }];
    expect(parent.textContent).toBe("123"); // 2 is still leaving
    expect(nodes.get(2).el.inert).toBe(true);
    nodes.get(2).animations.at(-1).end();
    await flush();
    expect(parent.textContent).toBe("13");
  });

  test("a re-added key builds a fresh node while the old one leaves", () => {
    const items = signal([{ id: 1 }]);
    const { parent, nodes } = list(items, fade());
    const first = nodes.get(1).el;
    items.value = [];
    items.value = [{ id: 1 }];
    expect(nodes.get(1).el).not.toBe(first);
    expect(parent.querySelectorAll("li")).toHaveLength(2);
  });
});

describe("built-in transitions", () => {
  const el = document.createElement("div");

  test("timing options pass through, with defaults", () => {
    expect(fade()(el, { direction: "in" })).toEqual({
      keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: undefined, delay: undefined, easing: undefined,
    });
    expect(fade({ duration: 90, delay: 10, easing: "linear" })(el, { direction: "in" })).toMatchObject({
      duration: 90, delay: 10, easing: "linear",
    });
  });

  test("scale and fly describe the hidden state", () => {
    expect(scale({ start: 0.5 })(el, { direction: "in" }).keyframes[0]).toEqual({ transform: "scale(0.5)", opacity: 0 });
    expect(fly()(el, { direction: "in" }).keyframes[0]).toEqual({ transform: "translate(0px, 8px)", opacity: 0 });
    expect(fly({ x: -20, y: 0, opacity: 0.5 })(el, { direction: "in" }).keyframes[0]).toEqual({
      transform: "translate(-20px, 0px)", opacity: 0.5,
    });
  });

  test("slide grows height from zero and clips while it runs", () => {
    const panel = document.createElement("div");
    const started = recordAnimations(panel);
    slide()(panel, { direction: "in" });
    const [hidden, shown] = started[0].keyframes;
    expect(hidden.height).toBe("0px");
    expect(hidden.paddingTop).toBe("0px");
    expect("height" in shown).toBe(true);
    expect(panel.style.overflow).toBe("hidden");
  });

  test("slide on the x axis animates width", () => {
    const panel = document.createElement("div");
    const started = recordAnimations(panel);
    slide({ axis: "x" })(panel, { direction: "in" });
    expect(started[0].keyframes[0].width).toBe("0px");
    expect(started[0].keyframes[0].paddingLeft).toBe("0px");
  });

  test("`initial` marks the transition", () => {
    expect(fade({ initial: true }).initial).toBe(true);
    expect(fade().initial).toBe(undefined);
  });
});
