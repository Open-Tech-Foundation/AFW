// The anchor-positioning fallback's placement maths: preferred side, flipping when it
// does not fit, alignment (mirrored in RTL), and clamping into the viewport.

import { describe, expect, test } from "runtime:test";
import { computePosition } from "../internal/position.js";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const vp = { vw: 1000, vh: 800 };
const trigger = rect(100, 100, 80, 30);
const menu = { width: 200, height: 150 };

describe("computePosition", () => {
  test("bottom-start: below the trigger, aligned to its start edge", () => {
    expect(computePosition(trigger, menu, { ...vp, placement: "bottom-start", offset: 4 })).toEqual({ left: 100, top: 134, side: "bottom" });
  });

  test("bottom-end and centered alignment", () => {
    // End-aligned: right edges meet (500 + 80 − 200 = 380).
    expect(computePosition(rect(500, 100, 80, 30), menu, { ...vp, placement: "bottom-end" }).left).toBe(380);
    // …unless that crosses the viewport edge (180 − 200 < 0): clamped to the gutter.
    expect(computePosition(trigger, menu, { ...vp, placement: "bottom-end" }).left).toBe(8);
    expect(computePosition(rect(400, 100, 80, 30), menu, { ...vp, placement: "bottom" }).left).toBe(340);
  });

  test("flips above when there is no room below and more above", () => {
    const low = rect(100, 700, 80, 30);
    expect(computePosition(low, menu, { ...vp, placement: "bottom-start", offset: 4 })).toEqual({ left: 100, top: 546, side: "top" });
  });

  test("stays on the preferred side when neither fits better", () => {
    const mid = rect(100, 380, 80, 30);
    const tall = { width: 200, height: 500 };
    expect(computePosition(mid, tall, { ...vp, placement: "bottom-start" }).side).toBe("bottom");
  });

  test("side placements flip horizontally", () => {
    const right = rect(900, 100, 80, 30);
    expect(computePosition(right, menu, { ...vp, placement: "right-start", offset: 4 }).side).toBe("left");
    expect(computePosition(trigger, menu, { ...vp, placement: "right-start", offset: 4 })).toEqual({ left: 184, top: 100, side: "right" });
  });

  test("RTL mirrors start/end and the inline side", () => {
    expect(computePosition(rect(500, 100, 80, 30), menu, { ...vp, placement: "bottom-start", rtl: true }).left).toBe(380);
    expect(computePosition(rect(500, 100, 80, 30), menu, { ...vp, placement: "right-start", rtl: true, offset: 4 }).side).toBe("left");
  });

  test("clamps into the viewport with a gutter", () => {
    const edge = rect(950, 100, 40, 30);
    expect(computePosition(edge, menu, { ...vp, placement: "bottom-start" }).left).toBe(1000 - 200 - 8);
  });
});
