import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { MODULE_ID } from "../scripts/constants.mjs";
import { FRAMES, SHAPES, BACKGROUNDS } from "../scripts/util.mjs";

const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const file = p => new URL(`../${p}`, import.meta.url);

test("manifest has the fields Foundry requires", () => {
  for (const k of ["id", "title", "description", "version", "compatibility"]) assert.ok(manifest[k], k);
  assert.match(manifest.id, /^[a-z0-9-]+$/);
  assert.equal(manifest.id, MODULE_ID, "constants.mjs and module.json must agree");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.compatibility.minimum && manifest.compatibility.verified);
  assert.equal(manifest.relationships.systems[0].id, "dnd5e");
  assert.equal(manifest.socket, true, "players without upload permission send the image to the GM");
});

test("every referenced file exists", () => {
  for (const p of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path)]) assert.ok(existsSync(file(p)), p);
});

const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
const langs = Object.fromEntries(manifest.languages.map(l => [l.lang, JSON.parse(readFileSync(file(l.path), "utf8"))]));

test("all languages define exactly the same keys as English", () => {
  const en = flatten(langs.en).sort();
  for (const [code, data] of Object.entries(langs)) assert.deepEqual(flatten(data).sort(), en, `${code} differs from en`);
});

test("placeholders match between languages", () => {
  const get = (o, path) => path.split(".").reduce((x, k) => x[k], o);
  const holders = s => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const key of flatten(langs.en)) {
    for (const [code, data] of Object.entries(langs)) assert.equal(holders(get(data, key)), holders(get(langs.en, key)), `${code}: ${key}`);
  }
});

test("every localization key used in the code exists", () => {
  const known = new Set(flatten(langs.en).map(k => k.replace(/^PLANAR_TOKENS\./, "")));
  const sources = readdirSync(file("scripts")).filter(n => n.endsWith(".mjs") && n !== "util.mjs")
    .map(n => readFileSync(file(`scripts/${n}`), "utf8")).join("\n");
  const used = [...sources.matchAll(/\b(?:t|warn|info|error)\(\s*"([\w.]+)"/g)].map(m => m[1]);
  assert.ok(used.length > 40, `found the t() calls (${used.length})`);
  for (const key of used) assert.ok(known.has(key), `missing key ${key}`);
  for (const [, key] of sources.matchAll(/"PLANAR_TOKENS\.([\w.]+)"/g)) assert.ok(known.has(key), `missing key ${key}`);
  for (const [, key] of readFileSync(file("scripts/settings.mjs"), "utf8").matchAll(/world\("(\w+)"/g)) {
    assert.ok(known.has(`Settings.${key}.Name`) && known.has(`Settings.${key}.Hint`), `setting ${key}`);
  }
  // keys built from the lists
  for (const f of FRAMES) assert.ok(known.has(`Frame.${f}.Name`) && known.has(`Frame.${f}.Hint`), f);
  for (const s of SHAPES) assert.ok(known.has(`Shape.${s}`), s);
  for (const b of BACKGROUNDS) assert.ok(known.has(`Background.${b}`), b);
  for (const m of ["framed", "ring"]) assert.ok(known.has(`Mode.${m}.Name`) && known.has(`Mode.${m}.Hint`), m);
});

test("the repo ships no campaign or publisher content", () => {
  const texts = ["lang/en.json", "lang/el.json", "README.md", "module.json"].filter(p => existsSync(file(p))).map(p => [p, readFileSync(file(p), "utf8")]);
  for (const [p, text] of texts) {
    for (const word of ["Shemeshka", "Sigil", "Fortune's Wheel", "Mortuary", "Morte", "Lady of Pain", "modron"]) {
      assert.ok(!text.includes(word), `${p} mentions ${word}`);
    }
  }
});

test("the module never deletes files on the server", () => {
  const sources = readdirSync(file("scripts")).map(n => readFileSync(file(`scripts/${n}`), "utf8")).join("\n");
  assert.ok(!/FilePicker[\w.]*\.(delete|remove|rename|move)\b|\bFP\(\)\.(delete|remove|rename|move)\b/i.test(sources));
});
