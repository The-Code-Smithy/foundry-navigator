# Foundry Navigator - Progress Notes

Last updated: 2026-11-05. This is a handoff file so work can resume after a folder move or laptop reload. Planned features live in `BACKLOG.md`; released changes live in `CHANGELOG.md`.

## Current state

- v0.17.2 is the current release. Attack target lists show only living enemies, confirmed on real tokens.
- Test work is on the `test-world-seed` branch, commit `c946ef5`. It is not merged to `main` or pushed.
- `FOUNDRY_URL` support in `playwright.config.js` was uncommitted when this file was written.
- The full suite passes 20 of 20 on both Foundry 14.369 and 14.370, with dnd5e 6.0.6 and Tidy 5e 14.4.1.

## Current focus

Module fixes. Suggested first step: trace the Tidy 5e console errors below.

## Known gaps

- Two Tidy 5e console errors appear during test runs without failing a test, and have not been traced:
  - `Failed to render svelte tab TypeError: $$props.sheetDocument.sheet._browseAddDocumentItemTypes is not a function`
  - `An error occurred while submitting changes TypeError: Cannot read properties of undefined (reading 'hasAttribute')`
- The combat test may not reach the path where a connected GM applies damage to a token the player doesn't own.
- No test triggers the "No living enemies to target." announcement on a real scene.
- Only the target list is checked against real tokens, not a complete attack.
- Automated tests can't show how a real screen reader sounds, so do a manual pass before releases.

## Decisions

- Compatibility is needed only within v14. v13 support is not needed.
- `module.json` still says `minimum: "13"` and the `package.json` description still says "v13 and v14". Change these in the next release, and check the READMEs too.

## Running the tests

1. Launch the `foundry-navigator-tests` world from Foundry's Setup screen. Setup has an admin password, so this step is manual.
2. Leave it at the join screen, with nobody logged in as Gamemaster.
3. Run `npm run test:foundry`, which reseeds the world and then runs everything.

If Playwright reports a missing browser, run `npx playwright install chromium`.

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

- A side-by-side Node.js install is at `C:\foundry\14.370`, with data in `C:\foundry\data-14.370`, on port 30001 with UPnP off.
- Start it from that folder with `node main.js --dataPath=C:\foundry\data-14.370 --port=30001`. Restart it after adding systems, modules, or worlds on disk.
- The suite passed there, so the module needs no changes for 14.370.
- System Node was updated to 24.22.2, and the suite passes on 14.370 with it. Stay on the 24.x line: the newest Node LTS is 26, and Foundry v14 is documented for Node 24.
- Remaining: upgrade the main install, which needs an uninstall and reinstall. Back up `%LOCALAPPDATA%\FoundryVTT\Data` first.
- The main install's `options.json` had `upnp: true` when checked.

## Ideas not started

- Fast Node tests that don't need Foundry, for logic such as target filtering and keybinding migration.
- Having Playwright start Foundry itself, so the manual launch step goes away.
