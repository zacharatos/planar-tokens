export const MODULE_ID = "planar-tokens";
export const EVENT = `module.${MODULE_ID}`;

/** Header-control action name on actor sheets. */
export const ACTION = "planarTokensOpen";

/** How long a player waits for the GM's client to save the image (ms). */
export const UPLOAD_TIMEOUT_MS = 30_000;

/** Biggest image a player may send to the GM for saving (bytes of data URL). */
export const MAX_RELAY_BYTES = 6 * 1024 * 1024;

/** The editor's stage: canvas size in CSS px, and the share of it the token takes. */
export const STAGE_PX = 440;
export const STAGE_TOKEN = 0.72;
