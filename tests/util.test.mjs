import { test } from "node:test";
import assert from "node:assert/strict";
import * as U from "../scripts/util.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("normalizeRecipe fills defaults and rejects bad values", () => {
  const r = U.normalizeRecipe({ shape: "blob", frame: "iron", thickness: 9, accent: "red", size: 333, zoom: -1, rot: 270, flip: 1 });
  assert.equal(r.schema, U.RECIPE_SCHEMA);
  assert.equal(r.shape, "circle");
  assert.equal(r.frame, "iron");
  assert.equal(r.thickness, U.THICK_MAX);
  assert.equal(r.accent, U.DEFAULT_STYLE.accent);
  assert.equal(r.size, U.DEFAULT_STYLE.size);
  assert.equal(r.zoom, U.ZOOM_MIN);
  assert.equal(r.rot, -90);
  assert.equal(r.flip, true);
  assert.deepEqual(Object.keys(U.styleOf(r)).sort(), Object.keys(U.DEFAULT_STYLE).sort());
});

test("normalizeRecipe uses the given base style", () => {
  const r = U.normalizeRecipe({}, { frame: "bone", size: 512 });
  assert.equal(r.frame, "bone");
  assert.equal(r.size, 512);
  assert.equal(U.normalizeRecipe({ accent: "#ABCDEF" }).accent, "#abcdef");
});

test("ring mode draws a plain circle", () => {
  const r = U.effective(U.normalizeRecipe({ mode: "ring", shape: "shield", frame: "gilded" }));
  assert.equal(r.shape, "circle");
  assert.equal(r.frame, "none");
  assert.equal(U.effective(U.normalizeRecipe({ shape: "shield" })).shape, "shield");
});

test("the portrait covers the token at zoom 1", () => {
  const b = U.imageBox(400, 800, { zoom: 1, ox: 0, oy: 0 });
  near(b.w, 1); near(b.h, 2);
  const l = U.imageBox(1200, 600, { zoom: 2, ox: 0.1, oy: 0 });
  near(l.h, 2); near(l.w, 4); near(l.cx, 0.1);
});

test("a tall portrait starts pushed down so its top is near the token's top", () => {
  const v = U.defaultView(500, 1000);
  assert.ok(v.oy > 0);
  const top = v.oy - U.imageBox(500, 1000, v).h / 2;
  assert.ok(top < -0.5 && top > -0.65, `top ${top}`);
  assert.equal(U.defaultView(1000, 1000).oy, 0);
});

test("zoomAt keeps the point under the cursor in place", () => {
  const v = { zoom: 1, ox: 0.2, oy: -0.1 };
  const p = [0.3, 0.25];
  const z = U.zoomAt(v, 2, ...p);
  // the image point under p: (p - centre) / zoom must be the same before and after
  near((p[0] - v.ox) / v.zoom, (p[0] - z.ox) / z.zoom);
  near((p[1] - v.oy) / v.zoom, (p[1] - z.oy) / z.zoom);
  assert.equal(U.zoomAt({ zoom: 7, ox: 0, oy: 0 }, 10).zoom, U.ZOOM_MAX);
});

test("zoom slider round-trips", () => {
  for (const z of [U.ZOOM_MIN, 0.5, 1, 3, U.ZOOM_MAX]) near(U.sliderToZoom(U.zoomToSlider(z)), z, z * 0.01);
  assert.equal(U.zoomToSlider(U.ZOOM_MIN), 0);
  assert.equal(U.zoomToSlider(U.ZOOM_MAX), 1000);
});

test("every shape fits inside the token box", () => {
  for (const s of U.SHAPES) {
    const pts = U.polyline(U.shapeOps(s));
    assert.ok(pts.length >= 6, s);
    for (const [x, y] of pts) assert.ok(Math.abs(x) <= 0.5 + 1e-6 && Math.abs(y) <= 0.5 + 1e-6, `${s}: ${x},${y}`);
  }
});

test("shapes run clockwise on screen (so inward normals point inside)", () => {
  for (const s of U.SHAPES) {
    const pts = U.polyline(U.shapeOps(s));
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      area += x0 * y1 - x1 * y0;
    }
    assert.ok(area > 0, `${s} area ${area}`); // y down: positive = clockwise on screen
  }
});

test("pointsAlong spaces points evenly and starts at the top", () => {
  const pts = U.pointsAlong(U.polyline([["C", 0.5]]), 4);
  assert.equal(pts.length, 4);
  near(pts[0].x, 0, 1e-3); near(pts[0].y, -0.5, 1e-3);
  near(pts[2].y, 0.5, 1e-2);
  assert.deepEqual(U.pointsAlong([], 3), []);
});

test("band points sit between the frame's edges", () => {
  const t = 0.08, inner = U.innerScale(t) * 0.5;
  for (const p of U.bandPoints("circle", t, 12)) {
    const r = Math.hypot(p.x, p.y);
    assert.ok(r > inner && r < 0.5, `r ${r}`);
  }
  assert.equal(U.bandPoints("hexagon", t, 6).length, 6);
});

test("colours", () => {
  assert.deepEqual(U.hexToRgb("#ff8000"), { r: 255, g: 128, b: 0 });
  assert.equal(U.rgbToHex({ r: 255, g: 128, b: 0 }), "#ff8000");
  assert.equal(U.shade("#808080", 1), "#ffffff");
  assert.equal(U.shade("#808080", -1), "#000000");
  assert.equal(U.rgba("#000000", 2), "rgba(0,0,0,1)");
  assert.equal(U.dispositionColor(-1), U.DISPOSITION_COLORS["-1"]);
  assert.equal(U.dispositionColor(99), U.DISPOSITION_COLORS[0]);
  assert.equal(U.accentFor({ accentAuto: true, accent: "#123456" }, 1), U.DISPOSITION_COLORS[1]);
  assert.equal(U.accentFor({ accentAuto: false, accent: "#123456" }, 1), "#123456");
});

test("seeded random is repeatable", () => {
  const a = U.seeded(3), b = U.seeded(3);
  for (let i = 0; i < 5; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test("file names", () => {
  assert.equal(U.slugify("Ζέφυρος ο Μάγος!"), "zefyros-o-magos");
  assert.equal(U.slugify("  Goblin  Boss "), "goblin-boss");
  assert.equal(U.slugify(""), "token");
  assert.equal(U.tokenFileName("Goblin", "abc123"), "goblin-abc123.webp");
  assert.equal(U.escapeHTML('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
});

test("target folder", () => {
  assert.equal(U.targetFolder("", "tofw"), "worlds/tofw/planar-tokens");
  assert.equal(U.targetFolder(" /tokens/npc/ ", "tofw"), "tokens/npc");
  assert.equal(U.targetFolder("a\\b", "w"), "a/b");
});

test("token update: framed switches the ring off, ring mode switches it on", () => {
  const framed = U.tokenUpdate(U.normalizeRecipe({}), "a.webp", { prototype: true });
  assert.deepEqual(framed, { "texture.src": "a.webp", "ring.enabled": false, randomImg: false });
  const ring = U.tokenUpdate(U.normalizeRecipe({ mode: "ring", accentAuto: true, background: "none" }), "b.webp", { disposition: -1 });
  assert.equal(ring["ring.enabled"], true);
  assert.equal(ring["ring.subject.texture"], "b.webp");
  assert.equal(ring["ring.colors.ring"], U.DISPOSITION_COLORS["-1"]);
  assert.equal(ring["ring.colors.background"], null);
  assert.ok(!("randomImg" in ring));
});

test("remote images are recognised", () => {
  const here = "https://vtt.example.com/game";
  assert.equal(U.isRemote("https://5e.tools/img/x.webp", here), true);
  assert.equal(U.isRemote("worlds/tofw/x.webp", here), false);
  assert.equal(U.isRemote("https://vtt.example.com/x.png", here), false);
  assert.equal(U.isRemote("blob:https://vtt.example.com/1", here), false);
});
