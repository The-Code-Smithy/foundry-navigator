# Foundry Navigator

Foundry Navigator adds keyboard-first and screen-reader-friendly navigation tools to Foundry Virtual Tabletop. It is currently focused on **D&D 5e character sheets and gameplay workflows on Foundry VTT v13 and v14**.

The module is designed to reduce reliance on mouse-only controls, hover interactions, and visually locating controls during character-sheet navigation and combat.

## Current Scope

- Foundry VTT v13 and v14
- D&D 5e system
- Default D&D 5e actor sheets
- Tidy 5e Sheets, including the modern layout

## What's New in v0.16.0

- `Alt+1` through `Alt+9` read recent roll history, newest first
- Attack and damage cards are combined into richer summaries when Foundry exposes target and damage details
- `Alt+Shift+R` remains available as the configurable fallback for reading the latest roll

## Feature Overview

### Character Sheet Keyboard Navigation

- `Alt+Shift+H` returns focus to the active sheet tab, including when focus is inside a sheet input
- `Tab` and `Shift+Tab` move between supported tab controls
- `Enter` activates tabs and common sheet actions
- Keyboard users can move into the active panel and cycle through interactive controls predictably
- `Escape` and `Ctrl+Shift+Tab` provide a clean way to leave sheet focus modes
- Spoken guidance plays when focus first enters a supported character sheet

### Inventory, Spell, and Action Support

- Keyboard support for inventory rows, spell rows, and feature rows
- Support for attack, use, and roll buttons on supported sheets
- Keyboard access to Tidy 5e item context menus
- Support for Tidy 5e's combined Sheet tab as well as dedicated Inventory and Spellbook layouts
- Improved handling for attack, damage, healing, and roll configuration dialogs
- Row-centric activation logic improves reliability when focus lands on nested controls such as item images
- Focus is restored to the originating row after many attack and consumable workflows complete

### Combat Tunnel and Targeting

- Keyboard-first target selection dialogs for D&D 5e attack and consumable flows
- Distance-aware target ordering
- Self-first consumable targeting when appropriate
- Hit or miss follow-up dialogs after attack rolls
- Direct damage and healing application without chasing chat card controls
- GM-mediated damage and healing application for players acting on unowned hostile tokens
- Screen reader narration from target selection through attack confirmation, damage application, and focus recovery

### Screen Reader Announcements

Announcement features are configurable per player, so each user can enable the feedback that is useful to them.

- Incoming chat messages
- Roll results, with a shortcut to re-read the latest result
- Combat turn changes
- UI notifications
- Token movement
- Tokens entering or leaving the current scene
- Detailed HP, damage, healing, and temporary HP changes on owned actors, plus damage and healing for currently targeted visible tokens without exposing hidden totals
- Condition and status effect changes on owned actors
- Improved labels and spoken hints in Foundry Navigator's Configure Settings controls

### Canvas Keyboard Actions

- `Enter` opens the actor sheet for the current keyboard token
- `Shift+Enter` targets the current keyboard token
- `Alt+Shift+T` targets the hovered token as a screen-reader-friendly alternative to Foundry's native `T`
- `Alt+Shift+W` announces the controlled token's grid position, HP, and active conditions
- `Alt+C` opens the controlled token's actor sheet or the current player's assigned character sheet

### Helpful Keyboard Shortcuts

- `Alt+Shift+H`: return focus to the active sheet tab
- `Alt+Shift+R`: re-read the latest roll result
- `Alt+1` through `Alt+9`: read recent roll history, newest first
- `Alt+C`: open your current character sheet, with a module fallback when Foundry cannot resolve it
- `Alt+Shift+A`: open Foundry Navigator settings
- `Alt+Shift+K`: open Configure Controls
- `Alt+Shift+P`: pause or unpause the game as a GM-friendly alternative to Space
- `Alt+Shift+W`: announce the controlled token's position, HP, and conditions
- `Enter`: open the current keyboard token's actor sheet
- `Shift+Enter`: target the current keyboard token
- `Alt+Shift+T`: target or untarget the hovered token without replacing Foundry's native `T`

Module shortcuts can be changed through Foundry's Configure Controls screen. Known older defaults are migrated automatically, while user-created remappings are preserved. While Configure Controls is open, `Ctrl+S` saves the dialog and `Alt+Backspace` or `Alt+Escape` cancels a stuck binding capture.

## Installation

Install the module using the manifest URL from the latest GitHub release:

`https://github.com/deathstarjim/foundry-navigator/releases/latest/download/module.json`

If you are testing development builds manually, make sure the manifest and download URLs match real public release artifacts and that the release zip contains `module.json` at the root.

## Limitations

- The most complete support is currently for D&D 5e on Foundry v13 and v14.
- Default D&D 5e sheets and Tidy 5e are the primary supported sheet types.
- Other systems and sheet implementations may work partially, but are not the focus of current development.
- Accessibility support is still evolving, and some Foundry or third-party module workflows may require further refinement.

## Acknowledgments

Foundry Navigator was inspired in part by earlier Foundry accessibility work from Cora (silvative), including the Accessibility Enhancements module. Direct feedback from screen-reader and keyboard-only players continues to guide development.

## Bugs and Enhancements

Bug reports, keyboard workflow feedback, screen-reader feedback, and enhancement requests should be submitted through GitHub issues.

When reporting a bug, please include:

- Foundry version
- game system and version
- whether you are using the default sheet or Tidy 5e
- any relevant supporting modules
- exact reproduction steps

When suggesting an enhancement, please describe the table workflow problem you are trying to solve and what the expected keyboard or screen-reader workflow should be.

## Contributing

Code contributions and real table feedback are welcome, especially feedback from players using keyboard-only or screen-reader-driven workflows.
