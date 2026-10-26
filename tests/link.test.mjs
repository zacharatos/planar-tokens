// Loads the real entry point against stubbed Foundry globals. This catches broken imports, missing
// exports and hook wiring mistakes; it does not replace testing in Foundry.
import { test } from "node:test";
import assert from "node:assert/strict";

const hooks = { once: {}, on: {} };
globalThis.Hooks = {
  once: (name, fn) => { hooks.once[name] = fn; },
  on: (name, fn) => { (hooks.on[name] ??= []).push(fn); },
  callAll: () => true
};
class FakeApp { static DEFAULT_OPTIONS = {}; constructor(o) { this.options = o; } render() {} }
globalThis.foundry = {
  applications: { api: { ApplicationV2: FakeApp, DialogV2: class {} }, apps: { FilePicker: { implementation: class {} } } },
  utils: { randomID: () => "abc123", deepClone: v => structuredClone(v) }
};
const settings = new Map();
const registered = { settings: [], sockets: [] };
globalThis.game = {
  user: { isGM: true, id: "gm" },
  users: { activeGM: { isSelf: true }, get: () => null },
  actors: { get: () => null },
  modules: new Map([["planar-tokens", {}]]),
  world: { id: "w" },
  settings: {
    register: (mod, key, cfg) => { registered.settings.push(`${mod}.${key}`); settings.set(key, cfg.default); },
    get: (mod, key) => settings.get(key),
    set: async (mod, key, v) => settings.set(key, v)
  },
  socket: { on: event => registered.sockets.push(event), emit() {} },
  i18n: { localize: k => k, format: k => k, lang: "en" }
};
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };

await import("../scripts/main.mjs");

test("registers its settings on init", () => {
  hooks.once.init();
  for (const k of ["players", "folder", "sheetButton", "defaultSize", "lastStyle"]) assert.ok(registered.settings.includes(`planar-tokens.${k}`), k);
});

test("exposes an api on ready and listens on the module socket", () => {
  hooks.once.ready();
  const api = game.modules.get("planar-tokens").api;
  assert.deepEqual(registered.sockets, ["module.planar-tokens"]);
  for (const fn of ["open", "render", "frames", "shapes", "backgrounds"]) assert.equal(typeof api[fn], "function", fn);
  assert.ok(api.frames().includes("gilded"));
  assert.equal(api.open("nope"), null);
});

const actor = (over = {}) => ({ documentName: "Actor", uuid: "Actor.a1", name: "Goblin", img: "a.webp", isOwner: true,
  testUserPermission: () => true, getFlag: () => undefined, prototypeToken: { disposition: -1 }, ...over });

test("adds one header control to actor sheets, wired to the sheet's actions", () => {
  const [fn] = hooks.on.getHeaderControlsActorSheetV2;
  const app = { document: actor(), options: { actions: {} } };
  const controls = [];
  fn(app, controls); fn(app, controls);
  assert.equal(controls.length, 1);
  assert.equal(controls[0].action, "planarTokensOpen");
  assert.equal(typeof app.options.actions.planarTokensOpen, "function");
});

test("no header control on other sheets or for players when players are off", () => {
  const [fn] = hooks.on.getHeaderControlsActorSheetV2;
  const controls = [];
  fn({ document: { documentName: "Item" }, options: { actions: {} } }, controls);
  assert.equal(controls.length, 0);
  game.user.isGM = false;
  settings.set("players", false);
  fn({ document: actor(), options: { actions: {} } }, controls);
  assert.equal(controls.length, 0);
  settings.set("players", true);
  fn({ document: actor({ testUserPermission: () => false }), options: { actions: {} } }, controls);
  assert.equal(controls.length, 0, "not an owner");
  game.user.isGM = true;
});

test("portrait button hook ignores apps without a portrait", () => {
  const [fn] = hooks.on.renderActorSheetV2;
  assert.doesNotThrow(() => fn({ document: { documentName: "Item" } }, null));
  assert.doesNotThrow(() => fn({ document: actor() }, { querySelector: () => null }));
});
