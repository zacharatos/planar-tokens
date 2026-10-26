# Changelog

All notable changes to this module. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
The release workflow uses the section matching the tag as the GitHub release notes, so keep the `## [x.y.z]` headings exact.

## [0.1.0]

### Added
- **Token Maker**: a button on the portrait of character and NPC sheets, and *Make a token* in the sheet's header menu, open an editor with the actor's portrait.
- Drag to move, scroll to zoom around the cursor (Shift: finer), arrow keys to nudge, rotate, mirror, *Whole image*, *Reset* (tall portraits start with the face near the top). The cut-off parts stay visible, dimmed.
- Shapes: circle, rounded square, hexagon, octagon, shield.
- Frames drawn in code: none, ring, gilded (gems), silver, bronze (rivets), iron (rust, rivets), bone, arcane (glowing runes), blades, glitch; a colour or *by disposition*; frame width; live thumbnails with the actor's own portrait.
- Backgrounds: transparent, solid, vignette, parchment, astral sky; optional soft inner shadow.
- *Foundry ring* mode: a round cut of the portrait as the subject of Foundry's dynamic token ring, with its colours set.
- *On the map* preview at 100 px and 50 px.
- Saves WebP (PNG fallback) to `worlds/<world>/planar-tokens/` or a folder from the settings; sets the prototype token and/or the actor's tokens on the viewed scene; never deletes files.
- The crop and style are stored on the actor (`flags.planar-tokens.recipe`, schema 1); the last style is remembered per user.
- Other sources: an image on the server, a file from the computer (button or drop), back to the portrait; *Download* a copy.
- Players who own the actor can use it (setting); without upload permission the image is saved by the GM's client over the module socket.
- Clear message when a portrait from another website can't be saved.
- API: `open`, `render`, `frames`, `shapes`, `backgrounds`; hook `planar-tokens.created`.
