// Put a saved token image on the actor: its prototype token, its tokens on the current scene,
// and remember the recipe so the editor opens where it was left.
import { MODULE_ID } from "./constants.mjs";
import { tokenUpdate } from "./util.mjs";

/** The world actor behind a sheet (a token's synthetic actor points back to it). */
export const baseActor = actor => (actor?.isToken ? game.actors.get(actor.id) ?? null : actor);

/** Tokens on the viewed scene that the new image would change. */
export function sceneTokens(actor) {
  const scene = globalThis.canvas?.scene;
  if (!scene || !actor) return [];
  if (actor.isToken) return actor.token?.parent === scene ? [actor.token] : [];
  return scene.tokens.filter(t => t.actorId === actor.id && t.isOwner);
}

export const disposition = actor =>
  actor?.isToken ? actor.token?.disposition ?? 0 : actor?.prototypeToken?.disposition ?? 0;

/**
 * @returns {Promise<{prototype: boolean, tokens: number}>}
 */
export async function applyToken(actor, path, recipe, { prototype = true, scene = true } = {}) {
  const result = { prototype: false, tokens: 0 };
  const base = baseActor(actor);
  const d = disposition(actor);
  if (prototype && base?.isOwner) {
    const u = tokenUpdate(recipe, path, { disposition: base.prototypeToken?.disposition ?? d, prototype: true });
    await base.update(Object.fromEntries(Object.entries(u).map(([k, v]) => [`prototypeToken.${k}`, v])));
    result.prototype = true;
  }
  if (scene) {
    const tokens = sceneTokens(actor);
    if (tokens.length) {
      const sceneDoc = tokens[0].parent;
      await sceneDoc.updateEmbeddedDocuments("Token", tokens.map(t => ({ _id: t.id, ...tokenUpdate(recipe, path, { disposition: t.disposition }) })));
      result.tokens = tokens.length;
    }
  }
  await remember(actor, recipe);
  return result;
}

/** Keep the recipe on the actor (crop and style), so the next edit starts from it. */
export async function remember(actor, recipe) {
  try { if (actor?.isOwner) await actor.setFlag(MODULE_ID, "recipe", recipe); }
  catch (err) { console.warn(`${MODULE_ID} | could not store the recipe`, err); }
}
