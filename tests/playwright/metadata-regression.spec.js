const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readJson(relativePath)
{
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("manifest, package metadata, and release URLs stay synchronized", () =>
{
    const manifest = readJson("module.json");
    const packageJson = readJson("package.json");
    const packageLock = readJson("package-lock.json");

    expect(manifest.id).toBe("foundry-navigator");
    expect(manifest.title).toBe("Foundry Navigator");
    expect(packageJson.name).toBe("foundry-navigator");
    expect(packageLock.name).toBe("foundry-navigator");
    expect(packageLock.packages[""].name).toBe("foundry-navigator");

    expect(packageJson.version).toBe(manifest.version);
    expect(packageLock.version).toBe(manifest.version);
    expect(packageLock.packages[""].version).toBe(manifest.version);
    expect(manifest.download).toContain(`/releases/download/${manifest.version}/module.zip`);

    const manifestPaths = [...manifest.scripts, ...manifest.esmodules, ...manifest.styles]
        .map(entry => typeof entry === "string" ? entry : entry.src);

    for (const scriptPath of manifestPaths)
    {
        expect(fs.existsSync(path.join(repoRoot, scriptPath)), `${scriptPath} should exist`).toBe(true);
    }
});


test("extracted sheettabs modules expose the expected integration points", () =>
{
    const sheettabs = fs.readFileSync(path.join(repoRoot, "scripts", "sheettabs.js"), "utf8");
    const rollApplication = fs.readFileSync(path.join(repoRoot, "scripts", "sheettabs", "roll-application.js"), "utf8");
    const itemUseIntercept = fs.readFileSync(path.join(repoRoot, "scripts", "sheettabs", "item-use-intercept.js"), "utf8");
    const globalKeyboardRouting = fs.readFileSync(path.join(repoRoot, "scripts", "sheettabs", "global-keyboard-routing.js"), "utf8");

    expect(sheettabs).toContain('from "./sheettabs/roll-application.js"');
    expect(sheettabs).toContain('from "./sheettabs/item-use-intercept.js"');
    expect(sheettabs).toContain('from "./sheettabs/global-keyboard-routing.js"');
    expect(sheettabs).toContain("createRollApplicationHandlers");
    expect(sheettabs).toContain("createFocusedItemUseIntercept");
    expect(sheettabs).toContain("registerGlobalSheetKeyboardRouting");

    expect(rollApplication).toContain("export function createRollApplicationHandlers");
    expect(rollApplication).toContain("export function getRollTotalValue");
    expect(rollApplication).toContain("export function getTargetArmorClass");
    expect(rollApplication).toContain("FN_SOCKET_REQUESTS");

    expect(itemUseIntercept).toContain("export function createFocusedItemUseIntercept");
    expect(itemUseIntercept).toContain("libWrapper.register");
    expect(itemUseIntercept).toContain("CONFIG.Item.documentClass.prototype.use");

    expect(globalKeyboardRouting).toContain("export function registerGlobalSheetKeyboardRouting");
    expect(globalKeyboardRouting).toContain("window.addEventListener(\"keydown\"");
    expect(globalKeyboardRouting).toContain("global Tab redirected into sheet");
});
test("module shortcuts avoid browser and Foundry core conflicts", () =>
{
    const screenreader = fs.readFileSync(path.join(repoRoot, "scripts", "screenreader.js"), "utf8");
    const sheettabs = fs.readFileSync(path.join(repoRoot, "scripts", "sheettabs.js"), "utf8");
    const bootstrap = fs.readFileSync(path.join(repoRoot, "scripts", "sheettabs", "bootstrap.js"), "utf8");
    const canvasKeyboard = fs.readFileSync(path.join(repoRoot, "scripts", "canvas-keyboard.js"), "utf8");

    expect(screenreader).toContain("editable: [{ key: 'KeyR', modifiers: ['Alt', 'Shift'] }]");
    expect(screenreader).toContain("editable: [{ key: `Digit${index}`, modifiers: ['Alt'] }]");
    expect(screenreader).toContain("getStructuredRollNarration");
    expect(screenreader).toContain("editable: [{ key: 'KeyW', modifiers: ['Alt', 'Shift'] }]");
    expect(screenreader).toContain("editable: [{ key: 'KeyP', modifiers: ['Alt', 'Shift'] }]");
    expect(screenreader).toContain("async function toggleGamePause()");
    expect(screenreader).toContain("editable: [{ key: 'KeyC', modifiers: ['Alt'] }]");
    expect(screenreader).toContain("function saveKeybindingsConfig");
    expect(screenreader).toContain('event.key?.toLowerCase?.() === "s"');
    expect(screenreader).toContain("precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY");
    expect(bootstrap).toContain('editable: [{ key: "KeyH", modifiers: ["Alt", "Shift"] }]');
    expect(canvasKeyboard).toContain('editable: [{ key: "KeyT", modifiers: ["Alt", "Shift"] }]');
    expect(canvasKeyboard).toContain('"toggleKeyboardTokenTarget"');
    expect(sheettabs).toContain('event.shiftKey');
    expect(sheettabs).toContain('event.key.toLowerCase() === "h"');
    expect(screenreader).not.toContain("editable: [{ key: 'KeyR', modifiers: ['Alt'] }]");
    expect(bootstrap).not.toContain('editable: [{ key: "KeyT", modifiers: ["Alt"] }]');
    expect(sheettabs).not.toContain('event.key.toLowerCase() === "t"');
    expect(screenreader).not.toContain("focusChatMessageBox");
});

test("known legacy defaults are migrated without replacing arbitrary custom bindings", () =>
{
    const screenreader = fs.readFileSync(path.join(repoRoot, "scripts", "screenreader.js"), "utf8");

    expect(screenreader).toContain("async function migrateLegacyDefaultKeybindings()");
    expect(screenreader).toContain('action: "foundry-navigator.whereAmI"');
    expect(screenreader).toContain('action: "foundry-navigator.focusCharacterSheetTabs"');
    expect(screenreader).toContain('action: "foundry-navigator.openMyCharacterSheet"');
    expect(screenreader).toContain("legacy.some(binding => keybindingListsMatch(current, binding))");
});
