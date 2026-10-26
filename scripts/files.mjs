// Loading portraits, picking files, saving the finished token on the server.
import { MODULE_ID } from "./constants.mjs";
import { targetFolder, tokenFileName } from "./util.mjs";
import { setting } from "./settings.mjs";
import { relayUpload } from "./rpc.mjs";

const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

const load = (src, cors) => new Promise((resolve, reject) => {
  const img = new Image();
  if (cors) img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`Could not load ${src}`));
  img.src = src;
});

/**
 * Load an image for drawing. Tries a CORS-clean load first; an image from another site that refuses
 * that still loads for the preview but is marked `tainted` (the browser won't let us save it).
 * @returns {Promise<{img: HTMLImageElement, tainted: boolean}>}
 */
export async function loadImage(src) {
  try { return { img: await load(src, true), tainted: false }; }
  catch {
    const img = await load(src, false); // throws if the image can't be loaded at all
    return { img, tainted: true };
  }
}

/** Ask for one image on the server. Resolves its path, or null when the picker closes without a choice. */
export function pickImage(current) {
  return new Promise(resolve => {
    const picker = new (FP())({ type: "image", current, callback: path => resolve(path) });
    const close = picker.close.bind(picker);
    picker.close = async (...args) => { setTimeout(() => resolve(null), 150); return close(...args); };
    picker.render(true);
  });
}

/** Make every missing folder along `dir` (the server has no "mkdir -p"). */
async function ensureDir(source, dir) {
  try { await FP().browse(source, dir); return; } catch { /* missing: create it level by level */ }
  const parts = dir.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const d = parts.slice(0, i).join("/");
    try { await FP().browse(source, d); } catch {
      try { await FP().createDirectory(source, d); } catch (err) { console.warn(`${MODULE_ID} | mkdir ${d}`, err); }
    }
  }
}

/** Upload here (this user may upload files). Returns the saved path. */
export async function uploadHere(blob, name) {
  const dir = targetFolder(setting("folder"), game.world.id);
  const ext = blob.type === "image/png" ? "png" : "webp";
  const file = new File([blob], tokenFileName(name, foundry.utils.randomID(6), ext), { type: blob.type });
  await ensureDir("data", dir);
  const res = await FP().upload("data", dir, file, {}, { notify: false });
  if (res === false || res?.status === "error") throw new Error(res?.message ?? "Upload failed");
  return res?.path ?? `${dir}/${file.name}`;
}

/** Save the token image: directly when this user may upload, otherwise through the GM's client. */
export async function saveToken(blob, name) {
  if (game.user.isGM || game.user.can?.("FILES_UPLOAD")) return uploadHere(blob, name);
  return relayUpload(blob, name);
}

/** Offer the image as a download (a copy on the user's own computer). */
export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = tokenFileName(name, "token", blob.type === "image/png" ? "png" : "webp");
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const blobToDataURL = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}
