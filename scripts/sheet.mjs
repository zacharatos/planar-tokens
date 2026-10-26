// The way in from a character or NPC sheet: a "Make token" entry in the sheet's header menu, and a
// small button over the portrait.
import { ACTION } from "./constants.mjs";
import { t } from "./i18n.mjs";
import { canUse, setting } from "./settings.mjs";
import { TokenEditor } from "./editor.mjs";

const actorOf = app => {
  const doc = app?.document ?? app?.actor;
  return doc?.documentName === "Actor" ? doc : null;
};

/** Hook: getHeaderControlsActorSheetV2 (app, controls). */
export function addHeaderControl(app, controls) {
  const actor = actorOf(app);
  if (!actor || !Array.isArray(controls) || !canUse(actor)) return;
  // header controls run their action through the sheet's own action table
  if (app.options?.actions && !app.options.actions[ACTION]) {
    app.options.actions[ACTION] = function () { TokenEditor.open(actorOf(this) ?? actor); };
  }
  if (controls.some(c => c.action === ACTION)) return;
  controls.push({ action: ACTION, icon: "fa-solid fa-circle-user", label: "PLANAR_TOKENS.Sheet.Control", visible: true });
}

const PORTRAIT = [
  ".sheet-header .portrait img", ".sheet-header img.portrait", ".portrait img", "img.portrait",
  "img.profile", "img.profile-img", 'img[data-edit="img"]'
].join(", ");

/** Hook: renderActorSheetV2 (app, element). Puts a button on the portrait. */
export function addPortraitButton(app, element) {
  const actor = actorOf(app);
  if (!actor || !setting("sheetButton") || !canUse(actor)) return;
  const root = element?.querySelector ? element : element?.[0] ?? app?.element;
  if (!root?.querySelector || root.querySelector(".ptk-portrait-btn")) return;
  const img = root.querySelector(PORTRAIT);
  const holder = img?.parentElement;
  if (!holder) return;
  holder.classList.add("ptk-portrait-holder");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ptk-portrait-btn";
  btn.dataset.tooltip = t("Sheet.Button");
  btn.setAttribute("aria-label", t("Sheet.Button"));
  btn.innerHTML = '<i class="fa-solid fa-circle-user"></i>';
  btn.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); TokenEditor.open(actor); });
  holder.append(btn);
}
