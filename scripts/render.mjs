// Canvas 2D drawing of a token: background, portrait, inner shadow, frame. Used for the live
// preview, the frame thumbnails and the final image (same code, any size).
import {
  shapeOps, scaleOps, innerScale, imageBox, bandPoints, polyline, pointsAlong, effective, accentFor,
  shade, rgba, seeded, hexToRgb
} from "./util.mjs";

/** A Path2D for shape ops, scaled by k, in a canvas of `size` px with the token centred. */
export function pathFor(ops, size, k = 1) {
  const p = new Path2D(), c = size / 2, s = size;
  const X = v => c + v * k * s;
  for (const [op, ...v] of ops) {
    if (op === "C") { p.moveTo(c + v[0] * k * s, c); p.arc(c, c, v[0] * k * s, 0, Math.PI * 2); }
    else if (op === "M") p.moveTo(X(v[0]), X(v[1]));
    else if (op === "L") p.lineTo(X(v[0]), X(v[1]));
    else if (op === "Q") p.quadraticCurveTo(X(v[0]), X(v[1]), X(v[2]), X(v[3]));
    else if (op === "Z") p.closePath();
  }
  return p;
}

/** Natural size of a loaded image (SVGs can report 0). */
export const dims = img => ({ w: img?.naturalWidth || img?.width || 512, h: img?.naturalHeight || img?.height || 512 });

/** Draw only the portrait with the recipe's view (no clipping). */
export function drawPortrait(ctx, img, recipe, size, cx = size / 2, cy = size / 2) {
  if (!img) return;
  const { w, h } = dims(img);
  const box = imageBox(w, h, recipe);
  ctx.save();
  ctx.translate(cx + box.cx * size, cy + box.cy * size);
  ctx.rotate((recipe.rot * Math.PI) / 180);
  if (recipe.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (-box.w * size) / 2, (-box.h * size) / 2, box.w * size, box.h * size);
  ctx.restore();
}

/**
 * Draw a whole token into ctx (a canvas of size × size).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{img?: HTMLImageElement, recipe: object, size: number, disposition?: number}} o
 */
export function renderToken(ctx, { img, recipe: raw, size, disposition = 0 }) {
  const recipe = effective(raw);
  const ops = shapeOps(recipe.shape);
  const framed = recipe.frame !== "none";
  const kIn = framed ? innerScale(recipe.thickness) : 1;
  const outer = pathFor(ops, size, 1);
  const inner = pathFor(ops, size, kIn);
  // the portrait reaches a little under the frame so no seam shows at its edge
  const under = pathFor(ops, size, framed ? Math.min(1, kIn + 0.02) : 1);
  const accent = accentFor(recipe, disposition);

  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.clip(under);
  drawBackground(ctx, recipe, size, accent);
  drawPortrait(ctx, img, recipe, size);
  if (recipe.shadow) innerShadow(ctx, framed ? inner : outer, size);
  ctx.restore();

  if (framed) {
    const band = new Path2D();
    band.addPath(outer); band.addPath(inner);
    const g = { ctx, size, outer, inner, band, ops, kIn, accent, recipe };
    (FRAME_DRAW[recipe.frame] ?? FRAME_DRAW.ring)(g);
  }
}

// ------------------------------------------------------------------------------------------ background

function drawBackground(ctx, recipe, size, accent) {
  const c = size / 2, col = recipe.bgColor;
  switch (recipe.background) {
    case "solid":
      ctx.fillStyle = col; ctx.fillRect(0, 0, size, size); break;
    case "vignette": {
      const g = ctx.createRadialGradient(c, c * 0.85, 0, c, c, c * 1.05);
      g.addColorStop(0, shade(col, 0.25)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.75));
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); break;
    }
    case "parchment": {
      ctx.fillStyle = "#d8c08e"; ctx.fillRect(0, 0, size, size);
      const rnd = seeded(7);
      for (let i = 0; i < 140; i++) {
        const x = rnd() * size, y = rnd() * size, r = size * (0.02 + rnd() * 0.09);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const dark = rnd() < 0.6;
        g.addColorStop(0, dark ? "rgba(120,84,40,0.10)" : "rgba(255,246,214,0.14)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const e = ctx.createRadialGradient(c, c, c * 0.45, c, c, c * 1.05);
      e.addColorStop(0, "rgba(90,55,20,0)"); e.addColorStop(1, "rgba(90,55,20,0.55)");
      ctx.fillStyle = e; ctx.fillRect(0, 0, size, size); break;
    }
    case "astral": {
      const g = ctx.createRadialGradient(c, c, 0, c, c, c * 1.1);
      g.addColorStop(0, shade(col, 0.1)); g.addColorStop(1, "#05030a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
      const rnd = seeded(31);
      for (let i = 0; i < 5; i++) { // nebula wisps in the accent colour
        const x = rnd() * size, y = rnd() * size, r = size * (0.15 + rnd() * 0.25);
        const n = ctx.createRadialGradient(x, y, 0, x, y, r);
        n.addColorStop(0, rgba(accent, 0.22)); n.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = n; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 90; i++) {
        const x = rnd() * size, y = rnd() * size, r = Math.max(0.5, size * 0.0025 * (rnd() < 0.9 ? rnd() : 2 + rnd()));
        ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default: break; // transparent
  }
}

/** A soft shadow inside the shape's edge, for depth. */
function innerShadow(ctx, path, size) {
  ctx.save();
  const hole = new Path2D();
  hole.rect(-size, -size, size * 3, size * 3);
  hole.addPath(path);
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = size * 0.06;
  ctx.fillStyle = "#000";
  ctx.fill(hole, "evenodd");
  ctx.restore();
}

// ------------------------------------------------------------------------------------------- frames

const lw = (size, f) => Math.max(1, size * f);

/** Metallic band: a diagonal gradient through the palette, dark edges and a fine highlight. */
function metal({ ctx, size, outer, inner, band, ops, kIn }, palette, { edge = "#1a120a" } = {}) {
  const g = ctx.createLinearGradient(0, 0, size, size);
  palette.forEach((c, i) => g.addColorStop(i / (palette.length - 1), c));
  ctx.save();
  ctx.fillStyle = g; ctx.fill(band, "evenodd");
  // a second, opposite sheen so the ring reads as rounded
  const s = ctx.createLinearGradient(size, 0, 0, size);
  s.addColorStop(0, "rgba(255,255,255,0)"); s.addColorStop(0.5, "rgba(255,255,255,0.18)"); s.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = s; ctx.fill(band, "evenodd");
  ctx.strokeStyle = edge;
  ctx.lineWidth = lw(size, 0.008); ctx.stroke(pathFor(ops, size, 1 - 0.004));
  ctx.lineWidth = lw(size, 0.008); ctx.stroke(inner);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = lw(size, 0.003);
  ctx.stroke(pathFor(ops, size, kIn + (1 - kIn) * 0.72));
  ctx.restore();
}

function gem(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.7)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.6));
  ctx.save();
  ctx.fillStyle = "#2a1d08"; ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function rivet(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "#e9e2d6"); g.addColorStop(0.5, "#8a8178"); g.addColorStop(1, "#2b2622");
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.arc(x + r * 0.2, y + r * 0.25, r * 1.05, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const at = (size, p) => [size / 2 + p.x * size, size / 2 + p.y * size];

const FRAME_DRAW = {
  ring(g) {
    const { ctx, size, band, inner, outer, accent } = g;
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, shade(accent, 0.25)); grad.addColorStop(1, shade(accent, -0.25));
    ctx.fillStyle = grad; ctx.fill(band, "evenodd");
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = lw(size, 0.006);
    ctx.stroke(inner); ctx.stroke(outer);
    ctx.restore();
  },

  gilded(g) {
    metal(g, ["#6e4f17", "#f7e38a", "#b4842a", "#fff4bf", "#8f6a22", "#e9cc68", "#6e4f17"]);
    const t = g.recipe.thickness;
    for (const p of bandPoints(g.recipe.shape, t, 4)) gem(g.ctx, ...at(g.size, p), g.size * t * 0.42, g.accent);
  },

  silver(g) {
    metal(g, ["#5d636b", "#eef2f6", "#9aa2ab", "#ffffff", "#7b838c", "#d7dde3", "#5d636b"], { edge: "#22262b" });
    const { ctx, size, ops, kIn, accent } = g;
    ctx.save();
    ctx.strokeStyle = accent; ctx.lineWidth = lw(size, 0.006);
    ctx.stroke(pathFor(ops, size, kIn + 0.006));
    ctx.restore();
  },

  bronze(g) {
    metal(g, ["#4a2a12", "#d8975a", "#8a5229", "#f1c08a", "#6b3b1b", "#c4834a", "#4a2a12"], { edge: "#1d0f06" });
    const t = g.recipe.thickness;
    for (const p of bandPoints(g.recipe.shape, t, 12)) rivet(g.ctx, ...at(g.size, p), g.size * t * 0.16);
  },

  iron(g) {
    metal(g, ["#1d1c1f", "#6b6870", "#2e2c31", "#8b8790", "#2a282c", "#5a565e", "#1d1c1f"], { edge: "#09080a" });
    const { ctx, size, band, recipe } = g;
    // rust and pitting, clipped to the band
    ctx.save();
    ctx.clip(band, "evenodd");
    const rnd = seeded(13);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size, y = rnd() * size, r = size * (0.006 + rnd() * 0.03);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rnd() < 0.55 ? "rgba(140,62,22,0.55)" : "rgba(0,0,0,0.45)"); rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
    for (const p of bandPoints(recipe.shape, recipe.thickness, 8)) rivet(ctx, ...at(size, p), size * recipe.thickness * 0.2);
  },

  bone(g) {
    metal(g, ["#8d826a", "#f3ecd6", "#c8bc9c", "#fffaf0", "#a99d80", "#e6dcc0", "#8d826a"], { edge: "#3b3326" });
    const { ctx, size, recipe } = g;
    ctx.save();
    ctx.strokeStyle = "rgba(60,48,30,0.55)"; ctx.lineCap = "round";
    ctx.lineWidth = lw(size, 0.004);
    const t = recipe.thickness;
    for (const p of bandPoints(recipe.shape, t, 36)) { // notches across the band
      const [x, y] = at(size, p), n = p.angle + Math.PI / 2, len = size * t * 0.28;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(n) * len, y - Math.sin(n) * len);
      ctx.lineTo(x + Math.cos(n) * len, y + Math.sin(n) * len);
      ctx.stroke();
    }
    ctx.restore();
  },

  arcane(g) {
    const { ctx, size, band, inner, outer, ops, kIn, accent, recipe } = g;
    ctx.save();
    const dark = ctx.createLinearGradient(0, 0, size, size);
    dark.addColorStop(0, "#1b1526"); dark.addColorStop(1, "#0c0912");
    ctx.fillStyle = dark; ctx.fill(band, "evenodd");
    ctx.shadowColor = accent; ctx.shadowBlur = size * 0.025;
    ctx.strokeStyle = shade(accent, 0.35);
    ctx.lineWidth = lw(size, 0.006); ctx.stroke(inner); ctx.stroke(pathFor(ops, size, 0.992));
    // runes: small seeded glyphs along the middle of the band
    const t = recipe.thickness, rnd = seeded(101), h = size * t * 0.3;
    ctx.lineWidth = lw(size, 0.0065); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = shade(accent, 0.55);
    ctx.shadowBlur = size * 0.018;
    for (const p of bandPoints(recipe.shape, t, Math.max(10, Math.round(22 * (1 - kIn) / 0.14)))) {
      const [x, y] = at(size, p);
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle);
      ctx.beginPath();
      const strokes = 2 + Math.floor(rnd() * 3);
      for (let s = 0; s < strokes; s++) {
        const pts = [-1, 0, 1].map(() => [(rnd() - 0.5) * h * 1.2, (rnd() - 0.5) * h * 2]);
        ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); if (rnd() < 0.6) ctx.lineTo(...pts[2]);
      }
      ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    void outer;
  },

  blades(g) {
    const { ctx, size, band, inner, recipe, accent } = g;
    metal(g, ["#1f1d22", "#77737c", "#36333a", "#9b97a0", "#2b292e", "#5f5b64", "#1f1d22"], { edge: "#09080a" });
    // thin blades pointing inward from the inner edge, like a crown of blades
    const t = recipe.thickness, kIn = innerScale(t);
    const edge = pointsAlong(polyline(scaleOps(shapeOps(recipe.shape), kIn)), 16);
    ctx.save();
    for (const p of edge) {
      const [x, y] = at(size, p);
      const n = p.angle + Math.PI / 2; // normal pointing inward for a clockwise path
      const len = size * t * 1.7, half = size * t * 0.26;
      const tx = Math.cos(p.angle) * half, ty = Math.sin(p.angle) * half;
      const blade = new Path2D();
      blade.moveTo(x - tx, y - ty); blade.lineTo(x + Math.cos(n) * len, y + Math.sin(n) * len); blade.lineTo(x + tx, y + ty); blade.closePath();
      const bg = ctx.createLinearGradient(x - tx, y - ty, x + tx, y + ty);
      bg.addColorStop(0, "#3b3940"); bg.addColorStop(0.5, "#e8e6ec"); bg.addColorStop(1, "#4a4850");
      ctx.fillStyle = bg; ctx.fill(blade);
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = lw(size, 0.002); ctx.stroke(blade);
    }
    ctx.strokeStyle = accent; ctx.lineWidth = lw(size, 0.004); ctx.stroke(inner);
    ctx.restore();
    void band;
  },

  glitch(g) {
    const { ctx, size, band, ops, kIn } = g;
    ctx.save();
    ctx.fillStyle = "#0b0b10"; ctx.fill(band, "evenodd");
    const mid = pathFor(ops, size, (1 + kIn) / 2);
    const w = size * (1 - kIn) * 0.32, off = size * 0.008;
    const rnd = seeded(5);
    const dash = Array.from({ length: 14 }, () => size * (0.02 + rnd() * 0.16));
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = w; ctx.setLineDash(dash);
    for (const [dx, col, shift] of [[-off, "rgba(0,229,255,0.9)", 0], [off, "rgba(255,0,153,0.9)", size * 0.035], [0, "rgba(255,255,255,0.35)", size * 0.08]]) {
      ctx.save(); ctx.translate(dx, dx * -0.4); ctx.strokeStyle = col; ctx.lineDashOffset = shift; ctx.stroke(mid); ctx.restore();
    }
    ctx.restore();
    // displaced slices across the band
    ctx.save();
    ctx.clip(band, "evenodd");
    for (let i = 0; i < 7; i++) {
      const y = rnd() * size, h = size * (0.006 + rnd() * 0.02);
      ctx.fillStyle = rnd() < 0.5 ? "rgba(0,229,255,0.45)" : "rgba(255,0,153,0.45)";
      ctx.fillRect(rnd() * size * 0.2, y, size, h);
    }
    ctx.restore();
  }
};

/** Average brightness of a hex colour (0..1), to pick readable overlays. */
export const lum = hex => { const { r, g, b } = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Render a token to a new canvas element. */
export function tokenCanvas(o) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = o.size;
  renderToken(canvas.getContext("2d"), o);
  return canvas;
}

/** Canvas → Blob (WebP, or PNG where WebP isn't supported). Throws "tainted" for cross-origin images. */
export function canvasBlob(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob?.type === "image/webp") return resolve(blob);
        canvas.toBlob(png => (png ? resolve(png) : reject(new Error("encode"))), "image/png");
      }, "image/webp", quality);
    } catch (err) {
      reject(err?.name === "SecurityError" ? Object.assign(new Error("tainted"), { tainted: true }) : err);
    }
  });
}
