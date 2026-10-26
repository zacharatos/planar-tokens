// Pure helpers: no Foundry globals, no DOM. Everything here is unit-tested (tests/util.test.mjs).
//
// Coordinates: a token is 1 × 1 "token units" with its centre at (0, 0), so the edge of a circle token
// is at radius 0.5. The portrait is placed by a *view*: its centre (ox, oy) in token units, a zoom
// (1 = the portrait just covers the token), a rotation in degrees and a horizontal flip.

export const RECIPE_SCHEMA = 1;

export const SHAPES = ["circle", "square", "hexagon", "octagon", "shield"];
export const FRAMES = ["none", "ring", "gilded", "silver", "bronze", "iron", "bone", "arcane", "blades", "glitch"];
export const BACKGROUNDS = ["none", "solid", "vignette", "parchment", "astral"];
export const SIZES = [256, 400, 512, 768, 1024];
export const MODES = ["framed", "ring"];

/** Frames that use the accent colour (the others have a fixed palette and use it only for gems or glow). */
export const ACCENT_FRAMES = new Set(["ring", "gilded", "silver", "arcane", "blades"]);

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 8;
export const THICK_MIN = 0.02;
export const THICK_MAX = 0.16;

/** Token disposition (CONST.TOKEN_DISPOSITIONS) → ring colour, as the common token tools use. */
export const DISPOSITION_COLORS = { 1: "#3fae5b", 0: "#e0b73a", "-1": "#c8382f", "-2": "#8a55c8" };

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, def) => (typeof v === "number" && Number.isFinite(v) ? v : def);
const pick = (v, list, def) => (list.includes(v) ? v : def);
const isHex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export const DEFAULT_STYLE = Object.freeze({
  mode: "framed",
  shape: "circle",
  frame: "gilded",
  thickness: 0.07,
  accent: "#b03a2e",
  accentAuto: false,
  background: "vignette",
  bgColor: "#2b2236",
  shadow: true,
  size: 400
});

/** A full recipe: the style plus where the portrait sits. Bad or missing values fall back to defaults. */
export function normalizeRecipe(r = {}, base = DEFAULT_STYLE) {
  const s = { ...DEFAULT_STYLE, ...base };
  const out = {
    schema: RECIPE_SCHEMA,
    src: typeof r.src === "string" ? r.src : "",
    mode: pick(r.mode, MODES, s.mode),
    shape: pick(r.shape, SHAPES, s.shape),
    frame: pick(r.frame, FRAMES, s.frame),
    thickness: clamp(num(r.thickness, s.thickness), THICK_MIN, THICK_MAX),
    accent: isHex(r.accent) ? r.accent.toLowerCase() : s.accent,
    accentAuto: typeof r.accentAuto === "boolean" ? r.accentAuto : s.accentAuto,
    background: pick(r.background, BACKGROUNDS, s.background),
    bgColor: isHex(r.bgColor) ? r.bgColor.toLowerCase() : s.bgColor,
    shadow: typeof r.shadow === "boolean" ? r.shadow : s.shadow,
    size: SIZES.includes(r.size) ? r.size : s.size,
    zoom: clamp(num(r.zoom, 1), ZOOM_MIN, ZOOM_MAX),
    ox: clamp(num(r.ox, 0), -4, 4),
    oy: clamp(num(r.oy, 0), -4, 4),
    rot: ((num(r.rot, 0) % 360) + 540) % 360 - 180,
    flip: !!r.flip
  };
  return out;
}

/** Only the style part of a recipe (what is remembered between portraits). */
export function styleOf(recipe) {
  const { mode, shape, frame, thickness, accent, accentAuto, background, bgColor, shadow, size } = recipe;
  return { mode, shape, frame, thickness, accent, accentAuto, background, bgColor, shadow, size };
}

/** What actually gets drawn: the Foundry ring mode is always a plain circle with no frame of ours. */
export function effective(recipe) {
  if (recipe.mode !== "ring") return recipe;
  return { ...recipe, shape: "circle", frame: "none", thickness: 0, shadow: false };
}

// ---------------------------------------------------------------------------------------------- view

/** Token units per image pixel at zoom 1: the shorter side of the portrait spans the token. */
export const coverScale = (iw, ih) => 1 / Math.max(1, Math.min(iw || 1, ih || 1));

/** Size and centre of the portrait in token units. */
export function imageBox(iw, ih, view) {
  const k = coverScale(iw, ih) * view.zoom;
  return { w: (iw || 1) * k, h: (ih || 1) * k, cx: view.ox, cy: view.oy };
}

/**
 * Where a fresh portrait starts. Portraits are usually taller than wide with the face in the upper
 * part, so a tall image is pushed down until its top almost meets the top of the token.
 */
export function defaultView(iw, ih) {
  const view = { zoom: 1, ox: 0, oy: 0, rot: 0, flip: false };
  if (ih > iw * 1.05) {
    const h = ih / Math.max(1, iw);
    view.oy = (h / 2 - 0.5) * 0.85;
  }
  return view;
}

/** Zoom by `factor` keeping the token-space point (px, py) fixed under the cursor. */
export function zoomAt(view, factor, px = 0, py = 0) {
  const zoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const f = zoom / view.zoom;
  return { ...view, zoom, ox: px + (view.ox - px) * f, oy: py + (view.oy - py) * f };
}

/** Move the portrait by (dx, dy) token units. */
export const panBy = (view, dx, dy) => ({ ...view, ox: clamp(view.ox + dx, -4, 4), oy: clamp(view.oy + dy, -4, 4) });

/** Zoom slider position (0..1000, logarithmic) ↔ zoom. */
export const zoomToSlider = z => Math.round((Math.log(clamp(z, ZOOM_MIN, ZOOM_MAX) / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 1000);
export const sliderToZoom = v => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, clamp(v, 0, 1000) / 1000);

// --------------------------------------------------------------------------------------------- shapes

/**
 * A shape as path operations in token units (centre 0,0, fits in -0.5..0.5):
 *   ["M", x, y]  ["L", x, y]  ["Q", cx, cy, x, y]  ["C", r] (full circle of radius r)  ["Z"]
 */
export function shapeOps(shape) {
  switch (shape) {
    case "square": {
      const a = 0.5, r = 0.11;
      return [["M", -a + r, -a], ["L", a - r, -a], ["Q", a, -a, a, -a + r], ["L", a, a - r], ["Q", a, a, a - r, a],
        ["L", -a + r, a], ["Q", -a, a, -a, a - r], ["L", -a, -a + r], ["Q", -a, -a, -a + r, -a], ["Z"]];
    }
    case "hexagon": { // flat top, as Foundry's hex grids with columns
      const ops = [];
      for (let i = 0; i < 6; i++) {
        const t = (Math.PI / 3) * i;
        ops.push([i ? "L" : "M", round(0.5 * Math.cos(t)), round(0.5 * Math.sin(t))]);
      }
      return [...ops, ["Z"]];
    }
    case "octagon": {
      const R = 0.5 / Math.cos(Math.PI / 8), ops = [];
      for (let i = 0; i < 8; i++) {
        const t = Math.PI / 8 + (Math.PI / 4) * i;
        ops.push([i ? "L" : "M", round(R * Math.cos(t)), round(R * Math.sin(t))]);
      }
      return [...ops, ["Z"]];
    }
    case "shield": // a heater shield
      return [["M", -0.44, -0.47], ["Q", 0, -0.42, 0.44, -0.47], ["L", 0.44, 0.02], ["Q", 0.42, 0.33, 0, 0.5],
        ["Q", -0.42, 0.33, -0.44, 0.02], ["Z"]];
    default:
      return [["C", 0.5]];
  }
}

const round = v => Math.round(v * 1e6) / 1e6;

/** Scale a shape about its centre. */
export const scaleOps = (ops, k) => ops.map(([op, ...v]) => [op, ...v.map(x => round(x * k))]);

/** The inner edge of the frame: the shape shrunk so the band is `thickness` wide at the top. */
export const innerScale = thickness => clamp((0.5 - thickness) / 0.5, 0.2, 1);

/** Flatten a shape to a closed polyline of [x, y] points (curves sampled). */
export function polyline(ops, steps = 12) {
  const pts = [];
  let cur = [0, 0];
  for (const [op, ...v] of ops) {
    if (op === "C") {
      const n = steps * 8;
      for (let i = 0; i < n; i++) {
        const t = -Math.PI / 2 + (2 * Math.PI * i) / n; // start at the top, clockwise
        pts.push([v[0] * Math.cos(t), v[0] * Math.sin(t)]);
      }
    } else if (op === "M" || op === "L") {
      cur = [v[0], v[1]]; pts.push(cur);
    } else if (op === "Q") {
      const [x0, y0] = cur;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([u * u * x0 + 2 * u * t * v[0] + t * t * v[2], u * u * y0 + 2 * u * t * v[1] + t * t * v[3]]);
      }
      cur = [v[2], v[3]];
    }
  }
  // drop a duplicated closing point
  const a = pts[0], b = pts[pts.length - 1];
  if (pts.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) pts.pop();
  return pts;
}

/** `n` points evenly spaced along a closed polyline, starting from the point nearest the top centre. */
export function pointsAlong(pts, n) {
  if (!pts.length || n <= 0) return [];
  // start at the topmost-centre point so decorations sit symmetrically
  let start = 0, best = Infinity;
  pts.forEach(([x, y], i) => { const d = Math.abs(x) + (y + 1) * 2; if (d < best) { best = d; start = i; } });
  const ring = [...pts.slice(start), ...pts.slice(0, start)];
  ring.push(ring[0]);
  const seg = [];
  let total = 0;
  for (let i = 1; i < ring.length; i++) {
    const l = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
    seg.push(l); total += l;
  }
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
    const t = seg[i] ? (target - acc) / seg[i] : 0;
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: Math.atan2(y1 - y0, x1 - x0) });
  }
  return out;
}

/** Points in the middle of the frame band (between the outer edge and the inner edge). */
export function bandPoints(shape, thickness, n) {
  const k = (1 + innerScale(thickness)) / 2;
  return pointsAlong(polyline(scaleOps(shapeOps(shape), k)), n);
}

// --------------------------------------------------------------------------------------------- colour

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  const n = m ? parseInt(m[1], 16) : 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;

/** Lighten (amt > 0) or darken (amt < 0) toward white/black; amt in -1..1. */
export function shade(hex, amt) {
  const c = hexToRgb(hex), t = amt < 0 ? 0 : 255, p = Math.abs(clamp(amt, -1, 1));
  return rgbToHex({ r: c.r + (t - c.r) * p, g: c.g + (t - c.g) * p, b: c.b + (t - c.b) * p });
}

export function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
}

export const dispositionColor = d => DISPOSITION_COLORS[String(d)] ?? DISPOSITION_COLORS[0];

/** The accent actually used: the disposition colour when "auto" is on. */
export const accentFor = (recipe, disposition) => (recipe.accentAuto ? dispositionColor(disposition ?? 0) : recipe.accent);

// ---------------------------------------------------------------------------------------------- misc

/** Small deterministic random generator (mulberry32), so textures look the same on every render. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** File-name friendly, keeps Greek letters (transliterated) so files stay readable on the server. */
const GREEK = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n",
  ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" };
export function slugify(s) {
  const base = String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[α-ω]/g, ch => GREEK[ch] ?? "");
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "token";
}

export const tokenFileName = (name, id, ext = "webp") => `${slugify(name)}-${id}.${ext}`;

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** The folder new tokens go to: the setting, or worlds/<world>/planar-tokens. No leading/trailing slash. */
export function targetFolder(setting, worldId) {
  const s = String(setting ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return s || `worlds/${worldId}/planar-tokens`;
}

/**
 * The change to a token (or prototype token) for a new image.
 * Framed tokens switch Foundry's dynamic ring off (our frame is in the picture);
 * ring mode switches it on, with our circle-cut portrait as the subject.
 */
export function tokenUpdate(recipe, path, { disposition, prototype = false } = {}) {
  const u = { "texture.src": path };
  if (recipe.mode === "ring") {
    Object.assign(u, {
      "ring.enabled": true,
      "ring.subject.texture": path,
      "ring.subject.scale": 1,
      "ring.colors.ring": accentFor(recipe, disposition),
      "ring.colors.background": recipe.background === "none" ? null : recipe.bgColor
    });
  } else u["ring.enabled"] = false;
  if (prototype) u.randomImg = false;
  return u;
}

/** True when the image comes from another site (and so may block saving the canvas). */
export function isRemote(src, origin) {
  try {
    const u = new URL(src, origin);
    return u.protocol.startsWith("http") && u.origin !== new URL(origin).origin;
  } catch { return false; }
}
