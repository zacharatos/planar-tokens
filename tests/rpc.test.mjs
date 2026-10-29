import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.foundry = { utils: { randomID: () => "id" } };
const { validRelay } = await import("../scripts/rpc.mjs");

test("only small WebP / PNG data URLs are relayed to the GM", () => {
  assert.equal(validRelay("data:image/webp;base64,AAAA"), true);
  assert.equal(validRelay("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(validRelay("data:image/svg+xml;base64,AAAA"), false);
  assert.equal(validRelay("data:text/html;base64,AAAA"), false);
  assert.equal(validRelay("https://example.com/x.webp"), false);
  assert.equal(validRelay("data:image/webp;base64,<script>"), false);
  assert.equal(validRelay("data:image/webp;base64," + "A".repeat(4 * 1024 * 1024)), false, "over the relay limit");
  assert.equal(validRelay("data:image/webp;base64," + "A".repeat(2 * 1024 * 1024)), true, "a large token still fits");
  assert.equal(validRelay(null), false);
});
