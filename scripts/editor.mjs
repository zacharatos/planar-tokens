// The token editor: a window with the portrait on a stage (drag to move, wheel to zoom), the token's
// shape, frame and background, a preview at map size, and "Create token".
import { MODULE_ID, STAGE_PX, STAGE_TOKEN } from "./constants.mjs";
import { t, info, warn, error } from "./i18n.mjs";
import {
  normalizeRecipe, styleOf, defaultView, zoomAt, panBy, zoomToSlider, sliderToZoom, effective,
  shapeOps, SHAPES, FRAMES, BACKGROUNDS, SIZES, ACCENT_FRAMES, escapeHTML as esc, accentFor
} from "./util.mjs";
import { renderToken, drawPortrait, pathFor, dims, tokenCanvas, canvasBlob } from "./render.mjs";
import { loadImage, pickImage, saveToken, download } from "./files.mjs";
import { applyToken, sceneTokens, disposition, baseActor } from "./apply.mjs";
import { setting } from "./settings.mjs";

const { ApplicationV2 } = foundry.applications.api;

const SHAPE_ICON = { circle: "fa-circle", square: "fa-square", hexagon: "fa-hexagon", octagon: "fa-octagon", shield: "fa-shield" };
const THUMB = 54;

export class TokenEditor extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["planar-tokens"],
    window: { title: "PLANAR_TOKENS.Editor.Title", icon: "fa-solid fa-circle-user", resizable: false },
    position: { width: 860, height: "auto" }
  };

  static #open = new Map();

  /** Open (or bring forward) the editor for an actor. */
  static open(actor, { src } = {}) {
    if (!actor) return null;
    const key = actor.uuid;
    let app = this.#open.get(key);
    if (!app) { app = new TokenEditor(actor, { src }); this.#open.set(key, app); }
    else if (src) app.#setSource(src);
    if (app.rendered) app.bringToFront?.();
    else app.render({ force: true });
    return app;
  }

  constructor(actor, { src } = {}) {
    super({ id: `planar-tokens-${actor.uuid.replace(/[^\w-]/g, "-")}` });
    this.actor = actor;
    const stored = actor.getFlag(MODULE_ID, "recipe");
    const last = game.settings.get(MODULE_ID, "lastStyle") ?? {};
    const base = { ...last, size: SIZES.includes(last.size) ? last.size : Number(setting("defaultSize")) || 400 };
    const start = src ?? actor.img;
    // the stored crop only fits the picture it was made for
    this.recipe = stored && stored.src === start ? normalizeRecipe(stored, base) : normalizeRecipe({ ...base, src: start }, base);
    this.keepView = !!(stored && stored.src === start);
    this.src = start;
    this.img = null;
    this.tainted = false;
    this.failed = false;
    this.busy = false;
    this.applyPrototype = !actor.isToken || !!baseActor(actor)?.isOwner;
    this.applyScene = true;
    this.#raf = 0;
  }

  #raf;
  #thumbTimer = 0;
  #drag = null;

  get title() { return t("Editor.TitleFor", { name: this.actor.name }); }

  async close(options) {
    TokenEditor.#open.delete(this.actor.uuid);
    if (this.src?.startsWith("blob:")) URL.revokeObjectURL(this.src);
    return super.close(options);
  }

  // ------------------------------------------------------------------------------------------ markup

  async _renderHTML() {
    const r = this.recipe;
    const opt = (list, cur, key) => list.map(v => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(t(`${key}.${v}`))}</option>`).join("");
    const shapes = SHAPES.map(s => `<button type="button" class="ptk-shape ${s === r.shape ? "on" : ""}" data-shape="${s}"
      data-tooltip="${esc(t(`Shape.${s}`))}" aria-label="${esc(t(`Shape.${s}`))}"><i class="fa-solid ${SHAPE_ICON[s]}"></i></button>`).join("");
    const frames = FRAMES.map(f => `<button type="button" class="ptk-frame ${f === r.frame ? "on" : ""}" data-frame="${f}"
      data-tooltip="${esc(t(`Frame.${f}.Hint`))}"><canvas width="${THUMB}" height="${THUMB}"></canvas><span>${esc(t(`Frame.${f}.Name`))}</span></button>`).join("");
    const tokens = sceneTokens(this.actor).length;
    const base = baseActor(this.actor);
    return `<div class="ptk-editor" data-mode="${r.mode}" data-frame="${r.frame}" data-bg="${r.background}">
      <section class="ptk-left">
        <div class="ptk-stage-wrap">
          <canvas class="ptk-stage" tabindex="0" aria-label="${esc(t("Editor.StageLabel"))}"></canvas>
          <div class="ptk-banner" hidden></div>
          <div class="ptk-dropzone"><i class="fa-solid fa-file-arrow-down"></i> ${esc(t("Editor.DropHere"))}</div>
        </div>
        <p class="ptk-hint"><i class="fa-solid fa-hand"></i> ${esc(t("Editor.HowTo"))}</p>
        <div class="ptk-row">
          <i class="fa-solid fa-magnifying-glass" data-tooltip="${esc(t("Editor.Zoom"))}"></i>
          <input type="range" data-k="zoom" min="0" max="1000" step="1" value="${zoomToSlider(r.zoom)}" aria-label="${esc(t("Editor.Zoom"))}">
          <i class="fa-solid fa-rotate" data-tooltip="${esc(t("Editor.Rotate"))}"></i>
          <input type="range" data-k="rot" min="-180" max="180" step="1" value="${Math.round(r.rot)}" aria-label="${esc(t("Editor.Rotate"))}">
        </div>
        <div class="ptk-row ptk-buttons">
          <button type="button" data-act="flip" data-tooltip="${esc(t("Editor.Flip"))}"><i class="fa-solid fa-left-right"></i></button>
          <button type="button" data-act="fit" data-tooltip="${esc(t("Editor.FitHint"))}"><i class="fa-solid fa-compress"></i> ${esc(t("Editor.Fit"))}</button>
          <button type="button" data-act="reset" data-tooltip="${esc(t("Editor.ResetHint"))}"><i class="fa-solid fa-arrows-to-circle"></i> ${esc(t("Editor.Reset"))}</button>
        </div>
        <div class="ptk-row ptk-buttons ptk-sources">
          <span class="ptk-label">${esc(t("Editor.Source"))}</span>
          <button type="button" data-act="src-portrait"><i class="fa-solid fa-user"></i> ${esc(t("Editor.FromPortrait"))}</button>
          <button type="button" data-act="src-server"><i class="fa-solid fa-folder-open"></i> ${esc(t("Editor.FromServer"))}</button>
          <button type="button" data-act="src-local"><i class="fa-solid fa-upload"></i> ${esc(t("Editor.FromComputer"))}</button>
          <input type="file" accept="image/*" class="ptk-file" hidden>
        </div>
      </section>

      <section class="ptk-right">
        <div class="ptk-seg" role="radiogroup">
          <button type="button" data-mode="framed" class="${r.mode === "framed" ? "on" : ""}" data-tooltip="${esc(t("Mode.framed.Hint"))}"><i class="fa-solid fa-circle-dot"></i> ${esc(t("Mode.framed.Name"))}</button>
          <button type="button" data-mode="ring" class="${r.mode === "ring" ? "on" : ""}" data-tooltip="${esc(t("Mode.ring.Hint"))}"><i class="fa-regular fa-circle"></i> ${esc(t("Mode.ring.Name"))}</button>
        </div>

        <h4 class="ptk-sub ptk-framed">${esc(t("Editor.Shape"))}</h4>
        <div class="ptk-shapes ptk-framed">${shapes}</div>

        <h4 class="ptk-sub ptk-framed">${esc(t("Editor.Frame"))}</h4>
        <div class="ptk-frames ptk-framed">${frames}</div>

        <label class="ptk-field ptk-framed ptk-thick"><span>${esc(t("Editor.Thickness"))}</span>
          <input type="range" data-k="thickness" min="0.02" max="0.16" step="0.005" value="${r.thickness}"></label>

        <label class="ptk-field ptk-accent"><span>${esc(t("Editor.Accent"))}</span>
          <input type="color" data-k="accent" value="${r.accent}">
          <label class="ptk-check" data-tooltip="${esc(t("Editor.AccentAutoHint"))}"><input type="checkbox" data-k="accentAuto" ${r.accentAuto ? "checked" : ""}> ${esc(t("Editor.AccentAuto"))}</label>
        </label>

        <label class="ptk-field"><span>${esc(t("Editor.Background"))}</span>
          <select data-k="background">${opt(BACKGROUNDS, r.background, "Background")}</select>
          <input type="color" data-k="bgColor" value="${r.bgColor}" class="ptk-bgcolor">
        </label>

        <label class="ptk-check ptk-framed"><input type="checkbox" data-k="shadow" ${r.shadow ? "checked" : ""}> ${esc(t("Editor.Shadow"))}</label>

        <label class="ptk-field"><span>${esc(t("Editor.Size"))}</span>
          <select data-k="size">${SIZES.map(s => `<option value="${s}" ${s === r.size ? "selected" : ""}>${s} × ${s}</option>`).join("")}</select>
        </label>

        <h4 class="ptk-sub">${esc(t("Editor.ApplyTo"))}</h4>
        <label class="ptk-check ${base?.isOwner ? "" : "ptk-disabled"}"><input type="checkbox" data-opt="prototype" ${this.applyPrototype && base?.isOwner ? "checked" : ""} ${base?.isOwner ? "" : "disabled"}>
          ${esc(t("Editor.Prototype"))}</label>
        <label class="ptk-check ${tokens ? "" : "ptk-disabled"}"><input type="checkbox" data-opt="scene" ${this.applyScene && tokens ? "checked" : ""} ${tokens ? "" : "disabled"}>
          ${esc(t("Editor.SceneTokens", { n: tokens }))}</label>

        <h4 class="ptk-sub">${esc(t("Editor.OnTheMap"))}</h4>
        <div class="ptk-previews">
          <canvas class="ptk-prev" data-px="100" width="140" height="140"></canvas>
          <canvas class="ptk-prev" data-px="50" width="80" height="80"></canvas>
        </div>
      </section>
    </div>
    <footer class="ptk-footer">
      <button type="button" data-act="download"><i class="fa-solid fa-download"></i> ${esc(t("Editor.Download"))}</button>
      <span class="ptk-spacer"></span>
      <button type="button" data-act="cancel">${esc(t("Editor.Cancel"))}</button>
      <button type="button" data-act="create" class="ptk-primary"><i class="fa-solid fa-stamp"></i> ${esc(t("Editor.Create"))}</button>
    </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    const root = this.element;
    const first = !root.dataset.ptkBound;
    if (first) { root.dataset.ptkBound = "1"; this.#bind(root); }
    this.#setupStage(); // the stage canvas is new after every render
    if (first && !this.img) this.#setSource(this.src, { keepView: this.keepView });
    else { this.#syncControls(); this.#redraw({ thumbs: true }); }
  }

  // ------------------------------------------------------------------------------------------ events

  #bind(root) {
    root.addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b || b.disabled || !root.contains(b)) return;
      if (b.dataset.shape) return this.#set({ shape: b.dataset.shape });
      if (b.dataset.frame) return this.#set({ frame: b.dataset.frame });
      if (b.dataset.mode) return this.#set({ mode: b.dataset.mode });
      const act = b.dataset.act;
      if (act) this.#action(act, ev);
    });
    root.addEventListener("input", ev => this.#onInput(ev));
    root.addEventListener("change", ev => {
      if (ev.target.matches(".ptk-file")) return this.#onLocalFile(ev.target.files?.[0]);
      if (ev.target.dataset.opt === "prototype") this.applyPrototype = ev.target.checked;
      if (ev.target.dataset.opt === "scene") this.applyScene = ev.target.checked;
      this.#onInput(ev);
    });
    // drop an image file (from the computer) or a path (from Foundry's file browser) on the window
    const wrap = root.querySelector(".ptk-stage-wrap");
    root.addEventListener("dragover", ev => { ev.preventDefault(); wrap.classList.add("ptk-dragging"); });
    root.addEventListener("dragleave", ev => { if (!root.contains(ev.relatedTarget)) wrap.classList.remove("ptk-dragging"); });
    root.addEventListener("drop", ev => {
      ev.preventDefault(); wrap.classList.remove("ptk-dragging");
      const file = [...(ev.dataTransfer?.files ?? [])].find(f => f.type.startsWith("image/"));
      if (file) return this.#onLocalFile(file);
      try {
        const data = JSON.parse(ev.dataTransfer.getData("text/plain"));
        const src = data?.src ?? data?.texture?.src ?? data?.img;
        if (typeof src === "string") this.#setSource(src);
      } catch { /* not ours */ }
    });
  }

  async #action(act) {
    const r = this.recipe;
    switch (act) {
      case "flip": return this.#set({ flip: !r.flip });
      case "fit": return this.#set({ zoom: this.#fitZoom(), ox: 0, oy: 0, rot: 0 });
      case "reset": { const { w, h } = dims(this.img); return this.#set(defaultView(w, h)); }
      case "src-portrait": return this.#setSource(this.actor.img);
      case "src-server": { const p = await pickImage(this.src?.startsWith("blob:") ? "" : this.src); if (p) this.#setSource(p); return; }
      case "src-local": return this.element.querySelector(".ptk-file")?.click();
      case "cancel": return this.close();
      case "download": return this.#export({ save: false });
      case "create": return this.#export({ save: true });
    }
  }

  #onInput(ev) {
    const el = ev.target, k = el.dataset.k;
    if (!k) return;
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (k === "zoom") v = sliderToZoom(Number(el.value));
    else if (k === "size") v = Number(el.value);
    else if (el.type === "range") v = Number(el.value);
    else v = el.value;
    this.#set({ [k]: v }, { fromControl: el });
  }

  #onLocalFile(file) {
    if (!file?.type?.startsWith("image/")) return;
    this.#setSource(URL.createObjectURL(file));
  }

  /** Change the recipe, then update the controls and redraw. */
  #set(patch, { fromControl } = {}) {
    const before = this.recipe;
    this.recipe = normalizeRecipe({ ...before, ...patch, src: this.src });
    this.#syncControls(fromControl);
    const styleChanged = ["mode", "shape", "frame", "thickness", "accent", "accentAuto", "background", "bgColor", "shadow"].some(k => k in patch);
    this.#redraw({ thumbs: styleChanged });
  }

  #syncControls(except) {
    const root = this.element, r = this.recipe;
    if (!root) return;
    const ed = root.querySelector(".ptk-editor");
    ed.dataset.mode = r.mode; ed.dataset.frame = r.frame; ed.dataset.bg = r.background;
    ed.classList.toggle("ptk-accent-used", r.mode === "ring" || ACCENT_FRAMES.has(r.frame) || r.background === "astral");
    for (const b of root.querySelectorAll("[data-shape]")) b.classList.toggle("on", b.dataset.shape === r.shape);
    for (const b of root.querySelectorAll("[data-frame]")) b.classList.toggle("on", b.dataset.frame === r.frame);
    for (const b of root.querySelectorAll(".ptk-seg [data-mode]")) b.classList.toggle("on", b.dataset.mode === r.mode);
    const set = (k, v) => { const el = root.querySelector(`[data-k="${k}"]`); if (el && el !== except) el.type === "checkbox" ? (el.checked = v) : (el.value = v); };
    set("zoom", zoomToSlider(r.zoom)); set("rot", Math.round(r.rot)); set("thickness", r.thickness);
    set("accent", accentFor(r, disposition(this.actor))); set("accentAuto", r.accentAuto);
    set("background", r.background); set("bgColor", r.bgColor); set("shadow", r.shadow); set("size", r.size);
    const accentInput = root.querySelector('[data-k="accent"]');
    if (accentInput) accentInput.disabled = r.accentAuto;
    const busy = this.busy, blocked = this.tainted || this.failed || !this.img;
    for (const b of root.querySelectorAll('[data-act="create"], [data-act="download"]')) b.disabled = busy || blocked;
    root.classList.toggle("ptk-busy", busy);
  }

  // ------------------------------------------------------------------------------------------ source

  async #setSource(src, { keepView = false } = {}) {
    if (!src) return;
    const old = this.src;
    this.src = src;
    this.failed = false;
    this.#banner(null);
    try {
      const { img, tainted } = await loadImage(src);
      if (this.src !== src) return; // a newer choice won
      this.img = img;
      this.tainted = tainted || false;
      if (tainted) this.#banner(t("Editor.Tainted"), "warn");
    } catch {
      this.img = null; this.failed = true;
      this.#banner(t("Editor.LoadFailed"), "error");
    }
    if (old && old !== src && old.startsWith("blob:")) URL.revokeObjectURL(old);
    if (!keepView && this.img) {
      const { w, h } = dims(this.img);
      this.recipe = normalizeRecipe({ ...this.recipe, ...defaultView(w, h), src });
    } else this.recipe = normalizeRecipe({ ...this.recipe, src });
    this.#syncControls();
    this.#redraw({ thumbs: true });
  }

  #banner(text, kind = "warn") {
    const el = this.element?.querySelector(".ptk-banner");
    if (!el) return;
    el.hidden = !text;
    el.className = `ptk-banner ptk-${kind}`;
    el.textContent = text ?? "";
  }

  /** Zoom at which the whole portrait fits inside the token (instead of covering it). */
  #fitZoom() {
    const { w, h } = dims(this.img);
    return Math.min(w, h) / Math.max(w, h);
  }

  // ------------------------------------------------------------------------------------------- stage

  #setupStage() {
    const stage = this.element.querySelector(".ptk-stage");
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    stage.width = stage.height = Math.round(STAGE_PX * dpr);
    stage.style.width = stage.style.height = `${STAGE_PX}px`;
    this.dpr = dpr;
    this.tokenLayer = document.createElement("canvas");
    this.tokenLayer.width = this.tokenLayer.height = Math.round(STAGE_PX * STAGE_TOKEN * dpr);

    const toToken = ev => {
      const rect = stage.getBoundingClientRect();
      const T = rect.width * STAGE_TOKEN;
      return { x: (ev.clientX - rect.left - rect.width / 2) / T, y: (ev.clientY - rect.top - rect.height / 2) / T, T };
    };
    stage.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      stage.setPointerCapture(ev.pointerId);
      this.#drag = { id: ev.pointerId, last: toToken(ev) };
      stage.classList.add("ptk-grabbing");
    });
    stage.addEventListener("pointermove", ev => {
      if (!this.#drag || this.#drag.id !== ev.pointerId) return;
      const p = toToken(ev), d = this.#drag;
      this.recipe = { ...this.recipe, ...panBy(this.recipe, p.x - d.last.x, p.y - d.last.y) };
      d.last = p;
      this.#redraw();
    });
    const end = ev => {
      if (!this.#drag || this.#drag.id !== ev.pointerId) return;
      this.#drag = null; stage.classList.remove("ptk-grabbing");
      this.#redraw({ thumbs: true });
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("wheel", ev => {
      ev.preventDefault();
      const p = toToken(ev);
      const f = Math.exp(-Math.sign(ev.deltaY) * Math.min(Math.abs(ev.deltaY), 120) / (ev.shiftKey ? 2400 : 600));
      this.recipe = { ...this.recipe, ...zoomAt(this.recipe, f, p.x, p.y) };
      this.#syncControls();
      this.#redraw({ thumbs: true });
    }, { passive: false });
    stage.addEventListener("dblclick", () => this.#action("reset"));
    stage.addEventListener("keydown", ev => {
      const step = ev.shiftKey ? 0.05 : 0.01;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[ev.key]) { ev.preventDefault(); this.#set(panBy(this.recipe, ...moves[ev.key])); }
      else if (ev.key === "+" || ev.key === "=") { ev.preventDefault(); this.#set(zoomAt(this.recipe, 1.05)); }
      else if (ev.key === "-") { ev.preventDefault(); this.#set(zoomAt(this.recipe, 1 / 1.05)); }
    });
  }

  #redraw({ thumbs = false } = {}) {
    if (thumbs) { clearTimeout(this.#thumbTimer); this.#thumbTimer = setTimeout(() => this.#drawThumbs(), 120); }
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => { this.#raf = 0; this.#drawStage(); this.#drawPreviews(); });
  }

  #drawStage() {
    const stage = this.element?.querySelector(".ptk-stage");
    if (!stage) return;
    const ctx = stage.getContext("2d"), S = stage.width, T = this.tokenLayer.width, off = (S - T) / 2;
    const r = this.recipe, d = disposition(this.actor);
    ctx.clearRect(0, 0, S, S);
    checker(ctx, S, Math.round(12 * this.dpr));
    // the whole portrait, dimmed, so you can see what is outside the token
    if (this.img) {
      ctx.save(); ctx.globalAlpha = 0.33;
      drawPortrait(ctx, this.img, r, T, S / 2, S / 2);
      ctx.restore();
    }
    renderToken(this.tokenLayer.getContext("2d"), { img: this.img, recipe: r, size: T, disposition: d });
    ctx.drawImage(this.tokenLayer, off, off);
    // the token's outline
    ctx.save();
    ctx.translate(off, off);
    ctx.setLineDash([6 * this.dpr, 5 * this.dpr]);
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = this.dpr;
    ctx.stroke(pathFor(shapeOps(effective(r).shape), T, 1));
    ctx.restore();
  }

  #drawPreviews() {
    for (const c of this.element?.querySelectorAll(".ptk-prev") ?? []) {
      const ctx = c.getContext("2d"), W = c.width, px = Number(c.dataset.px);
      const grid = px;
      ctx.fillStyle = "#4b4f45"; ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
      const o = (W - grid) / 2;
      for (let x = o % grid; x < W; x += grid) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, W); ctx.stroke(); }
      for (let y = o % grid; y < W; y += grid) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.tokenLayer, o, o, px, px);
    }
  }

  #drawThumbs() {
    const d = disposition(this.actor), dpr = this.dpr || 1;
    for (const b of this.element?.querySelectorAll(".ptk-frame") ?? []) {
      const c = b.querySelector("canvas");
      const size = Math.round(THUMB * dpr);
      if (c.width !== size) { c.width = c.height = size; c.style.width = c.style.height = `${THUMB}px`; }
      renderToken(c.getContext("2d"), { img: this.img, recipe: { ...this.recipe, mode: "framed", frame: b.dataset.frame }, size, disposition: d });
    }
  }

  // ------------------------------------------------------------------------------------------ export

  async #export({ save }) {
    if (this.busy || !this.img) return;
    if (this.tainted) return warn("Editor.Tainted");
    this.busy = true; this.#syncControls();
    try {
      const recipe = this.recipe;
      const canvas = tokenCanvas({ img: this.img, recipe, size: recipe.size, disposition: disposition(this.actor) });
      let blob;
      try { blob = await canvasBlob(canvas); }
      catch (err) { if (err?.tainted) { this.tainted = true; this.#banner(t("Editor.Tainted"), "warn"); return; } throw err; }
      await game.settings.set(MODULE_ID, "lastStyle", styleOf(recipe));
      if (!save) return download(blob, this.actor.name);
      const path = await saveToken(blob, this.actor.name);
      const remembered = { ...recipe, src: /^(blob|data):/.test(this.src) ? "" : this.src };
      const res = await applyToken(this.actor, path, remembered, { prototype: this.applyPrototype, scene: this.applyScene });
      info("Notify.Done", { name: this.actor.name, tokens: res.tokens, path });
      Hooks.callAll(`${MODULE_ID}.created`, { actor: this.actor, path, recipe: remembered, ...res });
      this.close();
    } catch (err) {
      console.error(`${MODULE_ID} |`, err);
      error("Notify.Failed", { error: err?.message ?? String(err) });
    } finally {
      this.busy = false;
      if (this.rendered) this.#syncControls();
    }
  }
}

function checker(ctx, S, cell) {
  ctx.fillStyle = "#1c1a21"; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#24212a";
  for (let y = 0; y < S; y += cell) for (let x = (y / cell) % 2 ? cell : 0; x < S; x += cell * 2) ctx.fillRect(x, y, cell, cell);
}
