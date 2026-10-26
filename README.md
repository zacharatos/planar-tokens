# Planar Tokens

Make a token from an actor's portrait in a few seconds, without leaving Foundry VTT (v14, dnd5e 6).

<!-- Screenshot: docs/images/editor.png (take one in Foundry) -->

- **From the sheet**: a button on the portrait of every character and NPC sheet (and *Make a token* in the sheet's header menu) opens the Token Maker with the current portrait.
- **Choose what shows**: drag the portrait to move it, scroll to zoom (Shift for finer steps), rotate, mirror, *Whole image*, *Reset* (face near the top). The parts outside the token stay visible, dimmed, so you see what you cut.
- **Shapes**: circle, rounded square, hexagon, octagon, shield.
- **Fantasy frames**: plain ring, gilded (with gems), silver, bronze (rivets), rusty iron, bone, arcane runes, a crown of blades, glitch. A colour for the frame, or **by disposition** (green friendly, yellow neutral, red hostile, purple secret). Every frame is previewed with your own portrait.
- **Backgrounds** behind portraits with transparency: transparent, solid colour, vignette, parchment, astral sky. Optional soft shadow inside the frame.
- **Foundry ring** mode: instead of our frame, a round cut of the portrait as the subject of Foundry's dynamic token ring, with the ring and background colours set.
- **On the map** preview at 100 px and 50 px grid sizes.
- **Applies it**: to the actor's prototype token (new tokens), and to its tokens on the current scene. A sheet opened from an unlinked token changes that token. Foundry's dynamic ring is switched off for framed tokens.
- **Remembers**: the crop and style are kept on the actor, so the next edit opens where you left it; your last style is the starting style for the next portrait.
- **Other images**: from the server, from your computer (or drop a file on the window), or back to the portrait. *Download* saves a copy to your computer.
- **Players**: owners can make tokens for their own characters (a setting). Players without upload permission send the finished image to the GM's client, which saves it. A GM must be online for that.

Nothing here is tied to a setting. The frames are drawn in code; the module ships no artwork or text from any publisher.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this into **Manifest URL**, and install:

```
https://github.com/zacharatos/planar-tokens/releases/latest/download/module.json
```

Enable the module in your world.

## Use

1. Open a character or NPC sheet and click the round button on the portrait (or the sheet's **⋮** menu → *Make a token*).
2. Drag and scroll the portrait until the face sits where you want it. Double-click resets.
3. Pick a shape, a frame, a colour and a background. Watch *On the map*.
4. Under *Use it for*, choose the actor's token and/or its tokens on this scene.
5. **Create token**. The image is saved as WebP in `worlds/<your world>/planar-tokens/` (a setting can change the folder). Old images are never deleted.

### When the image won't save

Portraits imported from another website (for example a link to an image host) can be shown but the browser refuses to save a picture made from them. The window says so. Use **From the server…** with a local copy, or **From your computer…**.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Players can make tokens | on | Owners can use the Token Maker on their characters |
| Folder for new tokens | empty | Where images are saved; empty means `worlds/<world>/planar-tokens` |
| Button on the portrait | on | The round button over sheet portraits (the header menu entry is always there) |
| Default image size | 400 × 400 | Starting size for new token images (256 to 1024) |

## Macro API

```js
const api = game.modules.get("planar-tokens").api;
api.open(actor);                                   // Actor, id or uuid; opens the editor
api.open(actor, { src: "path/to/other.webp" });    // start from another image
const blob = await api.render("path/to/portrait.webp", { frame: "iron", shape: "hexagon", size: 512 });
api.frames(); api.shapes(); api.backgrounds();     // the names you can use in a recipe
```

Hook: `planar-tokens.created` with `{ actor, path, recipe, prototype, tokens }` after a token is made.

## Development

No build step: Foundry loads `scripts/main.mjs`. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the file map, the checks (`npm test`) and the manual test list, and [docs/PUBLISHING.md](docs/PUBLISHING.md) for releases.

## License

MIT, see [LICENSE](LICENSE).
