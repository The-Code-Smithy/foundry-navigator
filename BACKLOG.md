# Foundry Navigator - Backlog

Items are grouped by theme. Priorities are relative to blind and low-vision player needs.
All features should be `scope: 'client'` (per-player opt-in) unless noted.

Status key:

- `[x]` complete and covered by the current implementation
- `[~]` partially implemented or implemented with narrower coverage than the full item describes
- `[ ]` not implemented

## Current Priority: Accessible D&D 5e Level Up
*This is the next high-impact milestone. A blind player should be able to start and finish a level increase without another person taking over the sheet.*

Implementation principle: preserve Foundry D&D 5e's native level-up and advancement behavior. Foundry Navigator should act as an accessibility bridge around that workflow by exposing entry points, managing keyboard focus, improving labels, announcing context and validation errors, and restoring focus when the workflow ends. Do not duplicate advancement rules, choices, or character-update logic.

- [ ] **Level-up workflow audit and fixtures** - document the actual default D&D 5e and Tidy 5e paths, create stable test actors with class advancements, and cover both sheets in Playwright.
- [ ] **Level-up entry point** - provide a discoverable keyboard path to the character/class area and the correct class's `Level Up` action without requiring the player to find an edit-mode icon.
- [ ] **Edit-mode access where required** - make entering and leaving default/Tidy sheet edit mode keyboard-operable, clearly labeled, and announced. Do not require edit mode when the native sheet exposes a safe direct level-up action.
- [ ] **Advancement manager focus and narration** - enhance the native D&D 5e advancement manager: announce the current step and choices, focus the first meaningful control, and keep Previous, Restart, Next, and Complete reachable in a predictable order.
- [ ] **Advancement choice controls** - verify and bridge keyboard operation for native ability increases, skill/tool/language choices, subclass and feature choices, spell choices, HP selection or rolls, and any compendium pickers opened by an advancement.
- [ ] **Validation and recovery** - move focus to the first invalid or incomplete choice, announce the problem, and preserve already completed choices when the player moves backward or retries.
- [ ] **Completion and cancellation** - announce completion/cancellation, return focus to the originating class row or character-sheet control, and confirm the resulting class and total character levels.
- [ ] **Level-up regression suite** - test at least one simple level increase and one multi-step advancement on both default D&D 5e and Tidy 5e sheets.

---

## Grid Coordinate System
*Prerequisite for most canvas announcements - implement first.*

- [ ] **Grid label overlay** - PIXI canvas layer that draws letter (A, B, C...) column headers along the top of the scene and number (1, 2, 3...) row headers down the left side, in world-space so they pan/zoom with the map. Semi-transparent so they do not obscure the map for sighted players. Toggleable per-client.
- [x] **Coordinate helper function** - shared utility `getGridLabel(token)` -> `"C3"` used by all announcement features below.
- [ ] **Persistent HUD readout** - small always-visible HTML overlay in a screen corner showing the controlled token's current grid position and HP (for example `Thorin - C3 - HP 22/30`). Useful for sighted players helping blind and low-vision players navigate.

---

## Screen Reader Announcements
*Builds on the ARIA live region system already in `screenreader.js`.*

- [x] **Token move** - announce name plus new grid coordinate when any owned token moves (for example "Thorin moves to C3").
- [x] **Token enter/leave scene** - announce when a token is added to or removed from the canvas (for example "Goblin King has entered the scene.").
- [x] **HP / damage changes** - damage, healing, temporary HP, and current totals are announced for owned actors. Damage and healing are also announced for currently targeted visible tokens without exposing unowned actors' exact HP or temporary HP.
- [x] **Status effects / conditions** - announce when a condition is applied to or removed from an owned token (for example "Prone applied to Thorin." / "Frightened 1 removed.").
- [x] **Dice roll results** - announce the result and total of any roll in chat (for example "Attack roll: 17."). Includes an `Alt+Shift+R` fallback to re-read the latest roll result from chat on demand, plus `Alt+1` through `Alt+9` structured roll-history shortcuts.
- [x] **Combat tunnel step narration** - expand the existing dialog narration so target selection, attack confirmation, damage application, and recovery/focus transitions are consistently announced from start to finish.

---

## Keyboard and No-Mouse Navigation
*Reducing the need for click-and-drag is the highest-value area for blind and low-vision players.*

- [x] **"Where am I" hotkey** - configurable keybind (default: `Alt+Shift+W`) that re-reads the controlled token's position, HP, and any active conditions via the assertive live region. Works on demand without any interaction.
- [~] **Initial token selection / open sheet flow** - `C` opens a controlled actor, assigned character, or the only owned scene token. A keyboard chooser for multiple owned tokens is not implemented.
- [ ] **Tab through nearby tokens** - `Tab` / `Shift+Tab` cycles through tokens on the canvas; `Enter` selects or controls, `Shift+Enter` targets. Still useful outside sheet-driven combat flows for scene exploration, selecting allies, and interacting with placed tokens.
- [ ] **Nearby token scan** - keybind announces tokens within a configurable radius of the controlled token, including distance, grid coordinate, and disposition filter (friendly, neutral, secret, hostile, or all). Useful for situational awareness even when combat targeting is handled from the sheet.
- [ ] **Arrow key token movement** - move a controlled token one grid square at a time using arrow keys. Foundry has partial support; ensure it works and triggers our announcements.
- [ ] **Keyboard ruler / distance check** - announce walking distance from the controlled token to the currently focused token (for example "Goblin Scout is 15 feet away, at B5.").

---

## Audio Cues
*Supplementary to the screen reader for faster spatial feedback.*

- [ ] **Positional move sound** - short tick or click when your token moves, distinct from other tokens.
- [ ] **Damage taken sound** - brief sound cue when HP drops.
- [ ] **Turn start chime** - distinctive sound when it becomes the player's turn, separate from or in addition to the combat announcement.

---

## UI / Sheet Improvements

- [~] **Actor sheet keyboard navigation audit** - tab strips, active panels, common controls, item rows, menus, and `Enter` / `Space` activation are supported and smoke-tested. Edit mode, level up, advancement dialogs, and less common sheet controls still need a complete audit.
- [ ] **Character sheet edit-mode access** - provide a keyboard-friendly way to enter and exit actor-sheet edit mode on default and Tidy 5e sheets so players can level up or change sheet data without hunting for the wrench icon.
- [ ] **5e level-up workflow** - make the D&D 5e leveling process keyboard-friendly end to end: enter sheet edit mode, reach the Character or Details tab, activate `Level Up`, and complete the level-up dialogs without requiring the mouse.
- [ ] **Spell/action quick-cast hotkey** - numbered hotkeys (`1`-`9`) to trigger frequently used actions from the hotbar without opening the character sheet.
- [ ] **Favorite character actions / quick access** - let each player assign stable, configurable shortcuts to commonly used weapons, spells, features, and other owned-item actions (for example a greataxe attack). Resolve favorites by item or activity ID rather than sheet position, announce the selected action, preserve Foundry's native roll and targeting dialogs, and provide an accessible way to review or change assignments when an item is renamed, replaced, or deleted.
- [ ] **Compendium browser keyboard navigation** - verify `Tab`, arrow keys, and `Enter` work correctly in D&D 5e compendium browsers.
- [ ] **Tooltip / description readout** - pressing a key while focused on an item, spell, or feat reads the full description text via the polite live region.
- [x] **Tidy 5e combined Sheet tab support** - extend the keyboard and combat-tunnel targeting flow so Tidy 5e's merged `Sheet` tab works the same as the dedicated `Inventory` and `Spellbook` tabs, including item-image activation, row targeting, and combat prompts.
- [~] **Generic item-row activation adapters** - row-centric helpers and per-sheet adapters exist for default D&D 5e and Tidy 5e. A public registration path for other systems and future sheet implementations is not implemented.

---

## Infrastructure / Quality of Life

- [ ] **System-agnostic HP hook** - the HP announcement currently needs system-specific attribute paths. Investigate a generic approach that works across additional systems if support expands beyond D&D 5e.
- [ ] **Setting profile / preset** - a single "Enable all screen reader features" toggle that turns on all announcement settings at once, for easier onboarding.
- [x] **Settings shortcut** - dedicated hotkey opens Configure Settings to the Foundry Navigator module and moves focus into the first setting control so settings can be changed without hunting through the full settings UI.
- [ ] **Sidebar pin / default-open option** - add a client setting to keep the right sidebar expanded by default, with a pin-style option so it stays open until the player explicitly closes it.
- [ ] **Keyboard shortcut reference sheet** - in-game pop-up (hotkey: `?` or `F1`) listing all keybindings added by this module.
