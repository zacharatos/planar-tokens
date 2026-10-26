import { MODULE_ID } from "./constants.mjs";
import { registerSettings, canUse } from "./settings.mjs";
import { registerSocket } from "./rpc.mjs";
import { uploadHere, dataURLToBlob } from "./files.mjs";
import { addHeaderControl, addPortraitButton } from "./sheet.mjs";
import { TokenEditor } from "./editor.mjs";
import { FRAMES, SHAPES, BACKGROUNDS, normalizeRecipe } from "./util.mjs";
import { tokenCanvas, canvasBlob } from "./render.mjs";
import { loadImage } from "./files.mjs";

const resolveActor = a => (typeof a === "string" ? (game.actors.get(a) ?? globalThis.fromUuidSync?.(a)) : a) ?? null;

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  registerSocket({ save: uploadHere, fromDataURL: dataURLToBlob });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = {
    /** Open the editor for an actor (Actor, id or uuid); optionally start from another image. */
    open: (actor, opts) => {
      const a = resolveActor(actor);
      return a && canUse(a) ? TokenEditor.open(a, opts) : null;
    },
    /** Render a token image without the editor. Returns a Blob. */
    render: async (src, recipe = {}, { disposition = 0 } = {}) => {
      const { img } = await loadImage(src);
      const r = normalizeRecipe({ ...recipe, src });
      return canvasBlob(tokenCanvas({ img, recipe: r, size: r.size, disposition }));
    },
    frames: () => [...FRAMES],
    shapes: () => [...SHAPES],
    backgrounds: () => [...BACKGROUNDS]
  };
});

Hooks.on("getHeaderControlsActorSheetV2", addHeaderControl);
Hooks.on("renderActorSheetV2", addPortraitButton);
