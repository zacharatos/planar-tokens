// Players who may not upload files send the finished image to the active GM's client, which saves it
// and answers with the path. Nothing else goes over the socket.
//   upload   player -> GM      { id, from, to, name, data }   data = "data:image/webp;base64,…"
//   uploaded GM -> player      { id, to, ok, path | error }
import { EVENT, MODULE_ID, UPLOAD_TIMEOUT_MS, MAX_RELAY_BYTES } from "./constants.mjs";
import { t } from "./i18n.mjs";

const pending = new Map();
let saver = null; // (blob, name) => path, set by main.mjs (avoids a files <-> rpc import cycle)
let toBlob = null;

export function registerSocket({ save, fromDataURL }) {
  saver = save; toBlob = fromDataURL;
  game.socket.on(EVENT, onMessage);
}

/** Valid relay payload? Only small WebP/PNG data URLs are accepted. */
export const validRelay = data =>
  typeof data === "string" && data.length <= MAX_RELAY_BYTES && /^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(data);

export async function relayUpload(blob, name) {
  const gm = game.users.activeGM;
  if (!gm) throw new Error(t("Notify.NoGM"));
  const { blobToDataURL } = await import("./files.mjs");
  const data = await blobToDataURL(blob);
  if (!validRelay(data)) throw new Error(t("Notify.TooBig"));
  const id = foundry.utils.randomID();
  const reply = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(t("Notify.Timeout"))); }, UPLOAD_TIMEOUT_MS);
    pending.set(id, msg => {
      clearTimeout(timer); pending.delete(id);
      msg.ok ? resolve(msg.path) : reject(new Error(msg.error || t("Notify.UploadFailed")));
    });
  });
  game.socket.emit(EVENT, { op: "upload", id, from: game.user.id, to: gm.id, name: String(name ?? "").slice(0, 80), data });
  return reply;
}

async function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  const me = game.user.id;
  if (msg.op === "uploaded" && msg.to === me) return pending.get(msg.id)?.(msg);
  if (msg.op !== "upload" || msg.to !== me || !game.user.isGM) return;
  const user = game.users.get(msg.from);
  let answer;
  try {
    if (!user) throw new Error("Unknown user");
    if (!game.settings.get(MODULE_ID, "players")) throw new Error(t("Notify.PlayersOff"));
    if (!validRelay(msg.data)) throw new Error(t("Notify.TooBig"));
    const path = await saver(await toBlob(msg.data), msg.name || user.name);
    answer = { ok: true, path };
  } catch (err) {
    console.warn(`${MODULE_ID} | upload for ${user?.name}`, err);
    answer = { ok: false, error: err?.message ?? String(err) };
  }
  game.socket.emit(EVENT, { op: "uploaded", id: msg.id, to: msg.from, ...answer });
}
