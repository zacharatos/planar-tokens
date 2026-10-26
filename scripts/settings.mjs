import { MODULE_ID } from "./constants.mjs";
import { DEFAULT_STYLE, SIZES } from "./util.mjs";

const world = (key, type, def, extra = {}) => game.settings.register(MODULE_ID, key, {
  name: `PLANAR_TOKENS.Settings.${key}.Name`, hint: `PLANAR_TOKENS.Settings.${key}.Hint`,
  scope: "world", config: true, type, default: def, ...extra
});

export function registerSettings() {
  world("players", Boolean, true);
  world("folder", String, "");
  world("sheetButton", Boolean, true);
  world("defaultSize", Number, DEFAULT_STYLE.size, {
    choices: Object.fromEntries(SIZES.map(s => [s, `${s} × ${s}`]))
  });
  // The last style this user chose, so the next portrait starts from it.
  game.settings.register(MODULE_ID, "lastStyle", { scope: "client", config: false, type: Object, default: {} });
}

export const setting = key => game.settings.get(MODULE_ID, key);

/** May this user make tokens for this actor? */
export function canUse(actor, user = game.user) {
  if (!actor || actor.documentName !== "Actor") return false;
  if (user.isGM) return true;
  return !!setting("players") && actor.testUserPermission(user, "OWNER");
}
