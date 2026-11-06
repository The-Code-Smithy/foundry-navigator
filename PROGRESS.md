# Foundry Navigator - Progress Notes

Last updated: 2026-11-05. This is a handoff file so work can resume after a folder move or laptop reload. Planned features live in `BACKLOG.md`; released changes live in `CHANGELOG.md`.

## Current state

- v0.17.2 is the latest published release. v0.18.0 is prepared on the `test-world-seed` branch but not merged or published.
- Test work is on the `test-world-seed` branch, pushed to GitHub but not merged to `main`. Run `git status` and `git log` for what's committed.
- The full suite passes 30 of 30 on Foundry 14.370 with dnd5e 6.0.6 and Tidy 5e 14.4.1. The 20 tests that existed at the time also passed on 14.369.

## Current focus

Module fixes. The Tidy 5e console errors seen during test runs came from the `setCharacterSheetClass` test helper, not the module, and are fixed. The GM damage path and a full attack on real tokens are now tested.

The v0.18.0 fixes are listed in `CHANGELOG.md`. The main install's copy doesn't have them yet. Publishing a GitHub release is what triggers the release workflow.

## Known gaps

- The "No living enemies to target." announcement is tested on both attack paths, but it is polite and the roll dialog's assertive narration follows right after it. Check with a real screen reader that it is actually heard.
- `roll-application.js` reads `flags.dnd5e.roll.type`, which dnd5e 6 doesn't set. Healing is detected through the activity type instead, and a real potion is now tested.
- If a player picks a potion target, then cancels the Use Ability dialog, that target stays staged. Using the same potion later without the picker, such as with the mouse, could heal the old target. Not tested or fixed.
- Multi-target healing (Mass Healing Word, Prayer of Healing, Mass Cure Wounds) and temporary HP spells (Heroism, False Life) are deliberately left out of the target picker. From the sheet they still roll without applying anything, and focus may be lost afterward.
- Healing spells are tested on the Tidy sheet only, not the default dnd5e sheet.
- The potion and healing spell target picker appears for keyboard use only. A mouse click skips it, so nobody is healed. Whether mouse clicks should get the picker is an open decision.
- The target picker skips itself silently when the scene has no visible tokens.
- The suite has never run with Midi-QOL, though a keyboard potion use worked by hand in a world running it.
- A player who owns a shared actor gets the combat-turn picker on that actor's turn, because the check is ownership.
- The spell branch in `activateWeaponItem` looks unreachable for players, because the combat-turn picker lists only weapons.
- Automated tests can't show how a real screen reader sounds. The user plans a manual walkthrough before updating their remote Foundry games.
- Open design question: with no valid targets, the attack still continues to the roll dialog. Keep that, or stop at the announcement?

## Decisions

- Compatibility is needed only within v14. v13 support is not needed.
- v0.18.0 sets `minimum: "14"`. Older releases remain available for v13 users. Revisit only if there is real demand.

## Running the tests

1. Launch the `foundry-navigator-tests` world from Foundry's Setup screen. Setup has an admin password, so this step is manual.
2. Leave it at the join screen, with nobody logged in as Gamemaster.
3. Run `npm run test:foundry`, which reseeds the world and then runs everything.

Tests run headless. Add `--headed` to watch a run. If Playwright reports a missing browser, run `npx playwright install chromium`.

The 14.370 test instance can be started with the test world in one step, with no Setup screen: from `C:\foundry\14370`, run `node main.js --dataPath=C:\foundry\data-14.370 --port=30001 --world=foundry-navigator-tests`.

To target another install, in PowerShell: `$env:FOUNDRY_URL = "http://localhost:30001"; npm run test:foundry`

### Rebuilding the test world

The world's contents come from `tests/seed/seed-world.js`, so only an empty world is needed:

1. Create a dnd5e world with the ID `foundry-navigator-tests`.
2. Enable Foundry Navigator, Tidy 5e Sheets, and libWrapper.
3. Keep the Gamemaster user free of a password.

### Warnings

- The seed deletes every actor, scene, combat, and chat message in the world. It refuses to run on any other world.
- Never run the suite against a real campaign. The combat test permanently changes the character.
- The installed module at `%LOCALAPPDATA%\FoundryVTT\Data\modules\foundry-navigator` is a plain copy, not a link to this repo. After changing `scripts/` or `styles/`, copy over the release files (`module.json`, `scripts`, `styles`, `README.md`, `README.html`, `CHANGELOG.md`, `LICENSE`), or the tests will run old code. Replacing the folder with a junction was proposed but not done.

## Foundry 14.370

- A side-by-side Node.js install is at `C:\foundry\14370`, with data in `C:\foundry\data-14.370`, on port 30001 with UPnP off.
- Start it from that folder with `node main.js --dataPath=C:\foundry\data-14.370 --port=30001`. Restart it after adding systems, modules, or worlds on disk.
- The suite passed there, so the module needs no changes for 14.370.
- System Node was updated to 24.22.2, and the suite passes on 14.370 with it. Stay on the 24.x line: the newest Node LTS is 26, and Foundry v14 is documented for Node 24.
- The main install was upgraded to 14.370 on 2026-11-05. The installer went over the old version and kept all worlds and data. It runs its own bundled Node 24.22.1, which includes the 24.22.1 security release, so it doesn't use system Node.
- The main install's `options.json` had `upnp: true` when checked.

## Ideas not started

- Fast Node tests that don't need Foundry, for logic such as target filtering and keybinding migration.
- Having Playwright start Foundry itself, so the manual launch step goes away.
