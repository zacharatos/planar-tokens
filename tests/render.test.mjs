// Draws every frame, shape, background and mode into a fake 2D context: catches typos and bad
// arguments in the drawing code. What the tokens look like is checked by eye (docs/DEVELOPMENT.md).
import { test } from "node:test";
import assert from "node:assert/strict";

let calls = 0;
const gradient = () => ({ addColorStop: (o, c) => { assert.ok(o >= 0 && o <= 1, `stop ${o}`); assert.equal(typeof c, "string"); } });
const ctx = new Proxy({}, {
  get(target, k) {
    if (k in target) return target[k];
    if (k === "createLinearGradient" || k === "createRadialGradient") return (...a) => { a.forEach(v => assert.ok(Number.isFinite(v), `${k} ${a}`)); return gradient(); };
    return (...args) => { calls++; for (const v of args) if (typeof v === "number") assert.ok(Number.isFinite(v), `${String(k)}(${args})`); };
  },
  set(target, k, v) { target[k] = v; return true; }
});
globalThis.Path2D = class {
  moveTo(...a) { a.forEach(v => assert.ok(Number.isFinite(v))); } lineTo(...a) { a.forEach(v => assert.ok(Number.isFinite(v))); }
  quadraticCurveTo() {} arc() {} rect() {} closePath() {} addPath() {}
};

const { renderToken } = await import("../scripts/render.mjs");
const U = await import("../scripts/util.mjs");
const img = { naturalWidth: 600, naturalHeight: 900 };

test("every frame on every shape, with every background, draws without errors", () => {
  for (const shape of U.SHAPES) for (const frame of U.FRAMES) for (const background of U.BACKGROUNDS) {
    const recipe = U.normalizeRecipe({ shape, frame, background, thickness: 0.1, accentAuto: frame === "ring" });
    assert.doesNotThrow(() => renderToken(ctx, { img, recipe, size: 128, disposition: -1 }), `${shape}/${frame}/${background}`);
  }
  assert.ok(calls > 1000);
});

test("ring mode, no image, rotated and mirrored", () => {
  for (const r of [{ mode: "ring" }, { rot: 45, flip: true, zoom: 3, ox: 1, oy: -1 }, { shadow: false, frame: "none" }]) {
    assert.doesNotThrow(() => renderToken(ctx, { img, recipe: U.normalizeRecipe(r), size: 400 }));
  }
  assert.doesNotThrow(() => renderToken(ctx, { img: null, recipe: U.normalizeRecipe({}), size: 64 }));
});
