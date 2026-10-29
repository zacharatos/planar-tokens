# Development

## Layout

```
module.json            manifest (id = planar-tokens; the id is permanent once published)
scripts/
  main.mjs             hooks: init (settings), ready (socket, api), sheet hooks
  sheet.mjs            "Make a token" header control and the button on the sheet portrait
  editor.mjs           the Token Maker window (ApplicationV2): markup, stage (drag/zoom), previews, export
  render.mjs           canvas drawing: background, portrait, inner shadow, the frames; canvas -> Blob
  files.mjs            load images (CORS check), file picker, upload (creates folders), download
  rpc.mjs              player -> GM upload relay over the module socket
  apply.mjs            set the prototype token / scene tokens, store the recipe on the actor
  settings.mjs  i18n.mjs  constants.mjs
  util.mjs             pure helpers (no Foundry globals): recipe, view maths, shapes, colours, names; unit-tested
styles/planar-tokens.css   scoped to .planar-tokens and .ptk-portrait-*
lang/en.json el.json   interface strings (keys under PLANAR_TOKENS.*)
tests/                 node:test: helpers, drawing into a fake canvas, relay validation, manifest + languages, link test
tools/                 stamp-manifest, package, release-api, check-syntax
.github/workflows/     ci.yml, release.yml
```

### Coordinates

A token is 1 × 1 *token units* centred on (0, 0). The recipe places the portrait: centre `ox`, `oy` in token units, `zoom` (1 = the shorter side of the portrait spans the token), `rot` in degrees, `flip`. Shapes are path operations in the same units (`shapeOps`), the frame's inner edge is the shape scaled by `innerScale(thickness)`. The same `renderToken` draws the stage, the thumbnails and the final image at any pixel size.

### Data

- `flags.planar-tokens.recipe` on the actor (or the token's synthetic actor): `{ schema: 1, src, mode, shape, frame, thickness, accent, accentAuto, background, bgColor, shadow, size, zoom, ox, oy, rot, flip }`. `normalizeRecipe` accepts anything and fills defaults; bump `RECIPE_SCHEMA` and migrate there if the shape changes.
- Client setting `lastStyle` (the style part only).
- Images go to `targetFolder(setting, world)`; names are `<slug>-<random6>.webp`.

## Run the checks

```
npm test
```

Syntax check of every `.mjs`, then the tests. They do not start Foundry: anything with sheets, the file picker, uploads, the socket or the canvas is checked by hand.

## Try it in Foundry

Symlink the repo into your user data as `Data/modules/planar-tokens/`, restart, enable the module, reload (F5) after each change.

### Manual test checklist

GM:
- Open a PC sheet (dnd5e 6): hover the portrait, a round button appears bottom-right; click it. The **⋮** header menu has *Make a token* too. Both open the same window (a second click brings it forward, no second window).
- The portrait shows with the face near the top; the parts outside the token are dimmed. Drag: it follows the mouse. Scroll: zooms around the cursor; Shift+scroll finer. Arrow keys nudge after clicking the stage. Double-click resets.
- Zoom and rotate sliders, *Mirror*, *Whole image*, *Reset* work and the sliders follow the wheel.
- Each shape button changes the token and the frame thumbnails. Each frame thumbnail shows your portrait in that frame; clicking selects it. *Frame width* thickens the band (hidden for *None*).
- *Colour* changes ring / gilded gems / silver line / arcane glow / blades line; *By disposition* greys the picker and uses the actor's disposition colour (a hostile NPC: red).
- Backgrounds: use a portrait with a transparent background (or zoom out) to see transparent / solid / vignette / parchment / astral.
- *Foundry ring*: shape and frame options disappear; *Create token*; the token on the map shows Foundry's ring in the chosen colour around the round portrait.
- *Create token* (framed) with *The actor's token* ticked: a toast with the path; the file is in `worlds/<world>/planar-tokens/`; Prototype Token → Appearance shows it and *Dynamic ring* is off. Drag the actor to the map: the new token uses it.
- With a token of that actor on the viewed scene and *Its tokens on this scene (n)* ticked: it changes at once. Several unlinked goblins of the same actor: all change.
- Open the sheet from an unlinked token (double-click the token): only that token changes; the prototype only if you also tick it.
- Re-open the editor: same crop and style. Open another actor: starts from the last style but its own default crop.
- *From the server…*: pick another image; cancel the picker: nothing hangs. *From your computer…* and dropping a file on the window: the new image loads. *Portrait* goes back.
- An actor whose portrait links to another website: the window shows the warning and *Create* / *Download* are disabled; a local image works.
- *Download*: a .webp file is saved by the browser.
- Settings: change *Folder for new tokens*, create: the folder is made (several levels) and used. Turn off *Button on the portrait*: the button goes, the menu entry stays.

Player (second browser, a player who owns a character, Player role without upload permission):
- The sheet has the button; *Create token* with the GM online: the toast shows the path, the token updates. With the GM logged out: a clear message that a GM must be online.
- *Players can make tokens* off: no button or menu entry for players.
- A player sees no button on sheets they only observe.
- Trusted Player (with upload permission): saves directly, works without the GM.
- As a player **without** "Upload new files" permission, make a 1024 px token: it saves through the GM (the GM's client must be connected) and appears on the actor. Other players' consoles show no errors.
