const { test, expect } = require("@playwright/test");

const TEST_USER_NAME = "Tester The Brave";
const TEST_ACTOR_NAME = "Tester The Brave";

test.beforeEach(async ({ page }) =>
{
    // Each test gets a fresh browser profile, which would otherwise open the
    // first-run setup dialog on top of the sheet.
    await page.addInitScript(() => localStorage.setItem("foundry-navigator.firstRunSetupVersion", "999"));

    page.on("console", message =>
    {
        // Keep this simple and visible in the terminal for local smoke-test debugging.
        console.log(`[browser:${message.type()}] ${message.text()}`);
    });

    page.on("pageerror", error =>
    {
        console.log(`[pageerror] ${error?.message ?? error}`);
    });
});

async function waitForGameReady(page)
{
    await page.waitForURL("**/game", { timeout: 30000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() =>
    {
        const hasGame = typeof window !== "undefined" && Boolean(window.game);
        const hasUi = typeof window !== "undefined" && Boolean(window.ui);
        const ready = Boolean(window.game?.ready);
        const canvasReady = Boolean(window.canvas?.ready);
        const activeUser = Boolean(window.game?.user?.id);
        const sidebarReady = Boolean(document.querySelector("#sidebar, #ui-right"));

        return hasGame && hasUi && ready && canvasReady && activeUser && sidebarReady;
    }, null, { timeout: 45000 });
}

async function joinAsTester(page)
{
    for (let attempt = 0; attempt < 3; attempt++)
    {
        await page.goto("/join");
        if (page.url().includes("/game"))
        {
            await waitForGameReady(page);
            return;
        }

        const joinForm = page.locator("#join-game-form");
        const criticalFailure = page.getByRole("heading", { name: /Critical Failure/i });
        const pageState = await Promise.race([
            joinForm.waitFor({ state: "visible", timeout: 15000 }).then(() => "join"),
            criticalFailure.waitFor({ state: "visible", timeout: 15000 }).then(() => "critical"),
        ]).catch(() => "unknown");

        if (pageState === "critical")
        {
            await page.waitForTimeout(1000);
            continue;
        }

        await expect(joinForm).toBeVisible({ timeout: 15000 });

        const userSelect = joinForm.locator('select[name="userid" i]');
        await expect(userSelect).toBeVisible();

        const userId = await userSelect.evaluate((select, { userName, actorName }) =>
        {
            const normalize = value => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
            const normalizedUserName = normalize(userName);
            const normalizedActorName = normalize(actorName);
            const options = Array.from(select.options);
            const option = options.find(candidate => normalize(candidate.textContent) === normalizedUserName)
                ?? options.find(candidate => normalize(candidate.textContent).includes(normalizedUserName))
                ?? options.find(candidate => normalize(candidate.textContent).includes(normalizedActorName));

            return option?.value ?? null;
        }, { userName: TEST_USER_NAME, actorName: TEST_ACTOR_NAME });

        expect(userId).toBeTruthy();
        await userSelect.selectOption(userId);

        const joinButton = joinForm.locator('button[name="join"]');
        await expect(joinButton).toBeVisible();
        await joinButton.click();
        await waitForGameReady(page);
        return;
    }

    throw new Error("Foundry join page did not become available. Is the world active?");
}

test("HP announcements protect unowned target totals", async ({ page }) =>
{
    await joinAsTester(page);

    const result = await page.evaluate(() =>
    {
        const helpers = globalThis.FoundryNavigatorHp;
        if (!helpers) return null;

        const ownedActor = {
            isOwner: true,
            name: "Hero",
            system: { attributes: { hp: { value: 12, max: 20, temp: 3 } } },
        };
        const targetActor = {
            isOwner: false,
            name: "Goblin",
            system: { attributes: { hp: { value: 7, max: 15, temp: 2 } } },
        };
        const visibleTarget = {
            actor: targetActor,
            name: "Goblin Scout",
            document: { id: "visible", hidden: false },
        };
        const hiddenTarget = {
            actor: targetActor,
            name: "Hidden Goblin",
            document: { id: "hidden", hidden: true },
        };
        const player = { isGM: false };
        const previousHp = { value: 15, max: 20, temp: 0 };
        const currentHp = { value: 12, max: 20, temp: 3 };
        const targetPreviousHp = { value: 12, max: 15, temp: 0 };
        const targetCurrentHp = { value: 7, max: 15, temp: 2 };
        const ownedContext = helpers.getHpAnnouncementContext(ownedActor, [], player);
        const targetContext = helpers.getHpAnnouncementContext(targetActor, [visibleTarget], player);

        return {
            ownedContext,
            targetContext,
            hiddenContext: helpers.getHpAnnouncementContext(targetActor, [hiddenTarget], player),
            untargetedContext: helpers.getHpAnnouncementContext(targetActor, [], player),
            ownedAnnouncement: helpers.getHpChangeAnnouncement(
                ownedActor,
                previousHp,
                currentHp,
                ownedContext
            ),
            targetAnnouncement: helpers.getHpChangeAnnouncement(
                targetActor,
                targetPreviousHp,
                targetCurrentHp,
                targetContext
            ),
        };
    });

    expect(result).not.toBeNull();
    expect(result.ownedContext).toEqual({
        name: "Hero",
        includeCurrentTotal: true,
        includeTemporaryHp: true,
    });
    expect(result.targetContext).toEqual({
        name: "Goblin Scout",
        includeCurrentTotal: false,
        includeTemporaryHp: false,
    });
    expect(result.hiddenContext).toBeNull();
    expect(result.untargetedContext).toBeNull();
    expect(result.ownedAnnouncement).toBe(
        "Hero takes 3 damage. Hero gains 3 temporary hit points. HP 12 of 20. 3 temporary HP."
    );
    expect(result.targetAnnouncement).toBe("Goblin Scout takes 5 damage.");
});

test("Alt+Shift+T registers as an alternate target binding", async ({ page }) =>
{
    await joinAsTester(page);

    const binding = await page.evaluate(() =>
    {
        const action = "foundry-navigator.toggleKeyboardTokenTarget";
        return {
            configured: game.keybindings.get("foundry-navigator", "toggleKeyboardTokenTarget"),
            active: (game.keybindings.activeKeys.get("KeyT") ?? [])
                .filter(candidate => candidate.action === action)
                .map(candidate => ({
                    action: candidate.action,
                    requiredModifiers: candidate.requiredModifiers,
                })),
        };
    });

    expect(binding.configured).toEqual([
        { key: "KeyT", modifiers: ["Alt", "Shift"] },
    ]);
    expect(binding.active).toContainEqual({
        action: "foundry-navigator.toggleKeyboardTokenTarget",
        requiredModifiers: ["Alt", "Shift"],
    });
});

test("Alt+Shift+P registers as an alternate GM pause binding", async ({ page }) =>
{
    await joinAsTester(page);

    const binding = await page.evaluate(() =>
    {
        const action = "foundry-navigator.toggleGamePause";
        return {
            configured: game.keybindings.get("foundry-navigator", "toggleGamePause"),
            active: (game.keybindings.activeKeys.get("KeyP") ?? [])
                .filter(candidate => candidate.action === action)
                .map(candidate => ({
                    action: candidate.action,
                    requiredModifiers: candidate.requiredModifiers,
                })),
            hasTogglePause: typeof game.togglePause === "function",
        };
    });

    expect(binding.configured).toEqual([
        { key: "KeyP", modifiers: ["Alt", "Shift"] },
    ]);
    expect(binding.active).toContainEqual({
        action: "foundry-navigator.toggleGamePause",
        requiredModifiers: ["Alt", "Shift"],
    });
    expect(binding.hasTogglePause).toBe(true);
});

test("Alt+C registers as the character sheet shortcut", async ({ page }) =>
{
    await joinAsTester(page);

    const binding = await page.evaluate(() =>
    {
        const action = "foundry-navigator.openMyCharacterSheet";
        return {
            configured: game.keybindings.get("foundry-navigator", "openMyCharacterSheet"),
            active: (game.keybindings.activeKeys.get("KeyC") ?? [])
                .filter(candidate => candidate.action === action)
                .map(candidate => ({
                    action: candidate.action,
                    requiredModifiers: candidate.requiredModifiers,
                })),
        };
    });

    expect(binding.configured).toEqual([
        { key: "KeyC", modifiers: ["Alt"] },
    ]);
    expect(binding.active).toContainEqual({
        action: "foundry-navigator.openMyCharacterSheet",
        requiredModifiers: ["Alt"],
    });
});

test("default keyboard shortcuts dispatch in Chrome", async ({ page }) =>
{
    await joinAsTester(page);
    await expectDefaultShortcutsDispatch(page);
});

test("default keyboard shortcuts dispatch with screen reader announcements enabled", async ({ page }) =>
{
    await joinAsTester(page);
    await enableScreenReaderAnnouncements(page);
    await expectDefaultShortcutsDispatch(page);
});

test("structured roll history narrates matching attack and damage cards", async ({ page }) =>
{
    await joinAsTester(page);

    const result = await page.evaluate(() =>
    {
        const helpers = globalThis.FoundryNavigatorRollHistory;
        if (!helpers) return null;

        const createRoot = (html) =>
        {
            const root = document.createElement("div");
            root.innerHTML = html;
            return root;
        };

        const attackRoot = createRoot(`
            <div class="dice-flavor">Dagger Melee Attack • Melee Weapon</div>
            <div class="dice-formula">1d20 + 2 + 2</div>
            <div class="dice-total">22</div>
        `);
        const damageRoot = createRoot(`
            <div class="dice-flavor">Dagger Damage Roll</div>
            <div class="dice-formula">1d4 + 2</div>
            <div class="dice-total">4</div>
            <ol class="targets">
                <li>
                    <strong>Tester the Barbarian</strong>
                    <span class="value">-2</span>
                </li>
            </ol>
        `);
        const baseMessage = {
            speaker: { alias: "Goblin Minion" },
            visible: true,
            isContentVisible: true,
        };
        const attack = helpers.getRollEntryFromMessage({
            ...baseMessage,
            id: "attack",
            timestamp: 1,
            flavor: "Dagger Melee Attack • Melee Weapon",
            rolls: [{ total: 22, formula: "1d20 + 2 + 2" }],
        }, attackRoot);
        const damage = helpers.getRollEntryFromMessage({
            ...baseMessage,
            id: "damage",
            timestamp: 2,
            flavor: "Dagger Damage Roll",
            rolls: [{ total: 4, formula: "1d4 + 2" }],
        }, damageRoot);

        attack.damageApplications = damage.damageApplications;
        attack.damageTotal = damage.totals[0];
        attack.damageFormula = damage.formula;
        attack.targets = damage.damageApplications.map(application => application.target);

        return {
            attack,
            damage,
            narration: helpers.getStructuredRollNarration(attack, 0),
        };
    });

    expect(result).not.toBeNull();
    expect(result.attack.item).toBe("Dagger");
    expect(result.attack.kind).toBe("attack");
    expect(result.damage.kind).toBe("damage");
    expect(result.damage.damageApplications).toEqual([
        { target: "Tester the Barbarian", amount: 2 },
    ]);
    expect(result.narration).toBe(
        "Most recent roll: Goblin Minion attacked Tester the Barbarian with Dagger. Rolled 22. Tester the Barbarian took 2 damage."
    );
});

async function logUserCharacterDiagnostics(page, actorName = "Tester the Brave")
{
    const diagnostics = await page.evaluate((name) =>
    {
        const user = game.user;
        const assignedCharacter = user?.character ?? null;
        const namedActor = game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name) ?? null;
        const namedActorOwnership = namedActor && user ? namedActor.testUserPermission(user, "OWNER") : false;

        return {
            userName: user?.name ?? null,
            assignedCharacterName: assignedCharacter?.name ?? null,
            assignedCharacterId: assignedCharacter?.id ?? null,
            namedActorName: namedActor?.name ?? null,
            namedActorId: namedActor?.id ?? null,
            namedActorOwnership
        };
    }, actorName);

    if (!diagnostics.assignedCharacterId || !diagnostics.namedActorOwnership)
    {
        console.log("[playwright] user/actor diagnostics", diagnostics);
    }

    return diagnostics;
}

async function getOwnedCharacterActors(page)
{
    return page.evaluate(() =>
    {
        const user = game.user;
        return (game.actors?.contents ?? [])
            .filter(actor => actor?.type === "character" && user && actor.testUserPermission(user, "OWNER"))
            .map(actor => ({
                id: actor.id,
                name: actor.name,
                uuid: actor.uuid
            }));
    });
}

async function openCharacterSheet(page, actorName = "Tester the Brave")
{
    const actorId = await page.evaluate((name) =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name)
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);
        if (!actor?.id)
        {
            return null;
        }

        actor.sheet?.render?.(true);
        return actor.id;
    }, actorName);

    expect(actorId).toBeTruthy();

    await page.waitForFunction((name) =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name)
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);
        return Boolean(game.ready && actor?.sheet?.rendered);
    }, actorName, { timeout: 25000 });

    const sheetSelector = `.application.sheet.actor.character[id$="Actor-${actorId}"]`;
    await page.waitForFunction((selector) =>
    {
        return Array.from(document.querySelectorAll(selector)).some(element => element.offsetParent);
    }, sheetSelector, { timeout: 25000 });

    const sheet = page.locator(sheetSelector).filter({ visible: true }).last();
    await expect(sheet).toBeVisible({ timeout: 25000 });
    await expect(sheet).toHaveClass(/sheet/);
    await expect(sheet).toHaveClass(/actor/);
    await expect(sheet).toHaveClass(/character/);

    return sheet;
}

async function setCharacterSheetClass(page, actorName, sheetClass)
{
    const actorId = await page.evaluate(async ({ name, desiredSheetClass }) =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name)
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);
        if (!actor?.id) return null;

        // Close the open sheet first: the flag swaps actor.sheet to a new, unrendered instance.
        if (actor.sheet?.rendered) await actor.sheet.close();
        await actor.setFlag("core", "sheetClass", desiredSheetClass);
        actor.sheet?.render?.(true);
        return actor.id;
    }, { name: actorName, desiredSheetClass: sheetClass });

    expect(actorId).toBeTruthy();
    return openCharacterSheet(page, actorName);
}

async function focusShouldReturnToTab(page, sheet, tabName)
{
    const keybindingDiagnostics = await page.evaluate(() =>
    {
        const action = "foundry-navigator.focusCharacterSheetTabs";
        return {
            configured: game.keybindings.get("foundry-navigator", "focusCharacterSheetTabs"),
            stored: game.settings.get("core", "keybindings")[action] ?? null,
            keyHActions: (game.keybindings.activeKeys.get("KeyH") ?? []).map(binding => ({
                action: binding.action,
                requiredModifiers: binding.requiredModifiers,
                optionalModifiers: binding.optionalModifiers,
                precedence: binding.precedence,
            })),
        };
    });
    expect(keybindingDiagnostics.configured).toEqual([
        { key: "KeyH", modifiers: ["Alt", "Shift"] },
    ]);
    expect(keybindingDiagnostics.keyHActions).toContainEqual(expect.objectContaining({
        action: "foundry-navigator.focusCharacterSheetTabs",
        requiredModifiers: ["Alt", "Shift"],
    }));

    const tab = sheet.getByRole("tab", { name: new RegExp(tabName, "i") });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", /true/i);
    await tab.press("Enter");
    await expect(tab).not.toBeFocused();

    await page.keyboard.press("Alt+Shift+H");
    await expect(tab).toBeFocused();
}

async function forceHighRolls(page)
{
    await page.evaluate(() =>
    {
        globalThis.__foundryNavigatorOriginalRandomUniform ??= CONFIG.Dice.randomUniform;
        CONFIG.Dice.randomUniform = () => 0.999999;
    });
}

async function lowerHostileArmorClass(page)
{
    await page.evaluate(async () =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);
        if (!actor) return;

        await actor.update({
            "system.abilities.str.value": 50,
            "system.attributes.prof": 10
        });

        const firstWeapon = actor.items?.find(item => item?.type === "weapon");
        if (firstWeapon)
        {
            await firstWeapon.update({
                "system.attack.bonus": "20"
            });
        }
    });
}

async function expectFocusInside(page, container)
{
    await expect(container).toBeVisible();
    await page.waitForFunction((element) =>
    {
        if (!(element instanceof HTMLElement)) return false;
        const activeElement = document.activeElement;
        return activeElement instanceof HTMLElement && element.contains(activeElement);
    }, await container.elementHandle(), { timeout: 25000 });
}

async function expectTargetPickerReady(page)
{
    const targetPickerForm = page.locator(".fn-target-picker__form").filter({ visible: true }).last();
    await expectFocusInside(page, targetPickerForm);

    const firstTargetChoice = targetPickerForm.locator('input[name="fn-target-choice"]').first();
    await expect(firstTargetChoice).toBeVisible({ timeout: 25000 });
    await expect(firstTargetChoice).toBeFocused({ timeout: 25000 });

    return targetPickerForm;
}

async function chooseNormalRoll(page)
{
    const normalButton = page.getByRole("button", { name: /Normal/i }).last();
    await expect(normalButton).toBeVisible({ timeout: 25000 });
    await normalButton.click();
}

const DEFAULT_SHORTCUTS = [
    { action: "whereAmI", chord: "Alt+Shift+KeyW", configured: [{ key: "KeyW", modifiers: ["Alt", "Shift"] }] },
    { action: "readLastRollResult", chord: "Alt+Shift+KeyR", configured: [{ key: "KeyR", modifiers: ["Alt", "Shift"] }] },
    { action: "readRollHistory1", chord: "Alt+Digit1", configured: [{ key: "Digit1", modifiers: ["Alt"] }] },
    { action: "readRollHistory2", chord: "Alt+Digit2", configured: [{ key: "Digit2", modifiers: ["Alt"] }] },
    { action: "readRollHistory3", chord: "Alt+Digit3", configured: [{ key: "Digit3", modifiers: ["Alt"] }] },
    { action: "readRollHistory4", chord: "Alt+Digit4", configured: [{ key: "Digit4", modifiers: ["Alt"] }] },
    { action: "readRollHistory5", chord: "Alt+Digit5", configured: [{ key: "Digit5", modifiers: ["Alt"] }] },
    { action: "readRollHistory6", chord: "Alt+Digit6", configured: [{ key: "Digit6", modifiers: ["Alt"] }] },
    { action: "readRollHistory7", chord: "Alt+Digit7", configured: [{ key: "Digit7", modifiers: ["Alt"] }] },
    { action: "readRollHistory8", chord: "Alt+Digit8", configured: [{ key: "Digit8", modifiers: ["Alt"] }] },
    { action: "readRollHistory9", chord: "Alt+Digit9", configured: [{ key: "Digit9", modifiers: ["Alt"] }] },
    { action: "openNavigatorSettings", chord: "Alt+Shift+KeyA", configured: [{ key: "KeyA", modifiers: ["Alt", "Shift"] }] },
    { action: "openConfigureControls", chord: "Alt+Shift+KeyK", configured: [{ key: "KeyK", modifiers: ["Alt", "Shift"] }] },
    { action: "toggleGamePause", chord: "Alt+Shift+KeyP", configured: [{ key: "KeyP", modifiers: ["Alt", "Shift"] }] },
    { action: "openMyCharacterSheet", chord: "Alt+KeyC", configured: [{ key: "KeyC", modifiers: ["Alt"] }] },
    { action: "focusCharacterSheetTabs", chord: "Alt+Shift+KeyH", configured: [{ key: "KeyH", modifiers: ["Alt", "Shift"] }] },
    { action: "toggleKeyboardTokenTarget", chord: "Alt+Shift+KeyT", configured: [{ key: "KeyT", modifiers: ["Alt", "Shift"] }] },
];

async function enableScreenReaderAnnouncements(page)
{
    await page.evaluate(async () =>
    {
        const settings = [
            "announceChatMessages",
            "announceRollResults",
            "announceCombatTurns",
            "announceNotifications",
            "announceTokenMove",
            "announceTokenCreateDelete",
            "announceHpChanges",
            "announceConditions",
        ];

        for (const key of settings)
        {
            await game.settings.set("foundry-navigator", key, true);
        }
    });
}

async function installShortcutRecorder(page, shortcuts)
{
    await page.evaluate((entries) =>
    {
        globalThis.__fnShortcutRecorder?.restore?.();

        const originals = [];
        const hits = [];
        const wrapHandler = (target, property, actionId) =>
        {
            if (!target || typeof target[property] !== "function") return;
            const original = target[property];
            originals.push({ target, property, original });
            target[property] = () =>
            {
                hits.push(actionId);
                return true;
            };
        };

        for (const entry of entries)
        {
            const actionId = `foundry-navigator.${entry.action}`;
            const action = game.keybindings.actions?.get?.(actionId);
            if (!action)
            {
                throw new Error(`Missing keybinding action ${actionId}`);
            }

            wrapHandler(action, "onDown", actionId);

            for (const binding of game.keybindings.activeKeys.get(entry.configured[0].key) ?? [])
            {
                if (binding?.action !== actionId) continue;
                wrapHandler(binding, "onDown", actionId);
            }
        }

        globalThis.__fnShortcutRecorder = {
            hits,
            restore()
            {
                for (const original of originals)
                {
                    original.target[original.property] = original.original;
                }
            },
        };
    }, shortcuts);
}

async function restoreShortcutRecorder(page)
{
    await page.evaluate(() => globalThis.__fnShortcutRecorder?.restore?.()).catch(() => {});
}

async function expectDefaultShortcutsDispatch(page)
{
    const configuration = await page.evaluate((entries) =>
    {
        return entries.map(entry =>
        {
            const actionId = `foundry-navigator.${entry.action}`;
            const activeBindings = (game.keybindings.activeKeys.get(entry.configured[0].key) ?? [])
                .filter(candidate => candidate.action === actionId)
                .map(candidate => ({
                    action: candidate.action,
                    requiredModifiers: candidate.requiredModifiers,
                }));

            return {
                action: entry.action,
                configured: game.keybindings.get("foundry-navigator", entry.action),
                activeBindings,
            };
        });
    }, DEFAULT_SHORTCUTS);

    for (const entry of DEFAULT_SHORTCUTS)
    {
        const actual = configuration.find(candidate => candidate.action === entry.action);
        expect(actual.configured).toEqual(entry.configured);
        expect(actual.activeBindings).toContainEqual({
            action: `foundry-navigator.${entry.action}`,
            requiredModifiers: entry.configured[0].modifiers,
        });
    }

    await installShortcutRecorder(page, DEFAULT_SHORTCUTS);

    try
    {
        await page.locator("body").click({ position: { x: 10, y: 10 } });
        for (const entry of DEFAULT_SHORTCUTS)
        {
            await page.keyboard.press(entry.chord);
        }

        const hits = await page.evaluate(() => globalThis.__fnShortcutRecorder?.hits ?? []);
        expect(hits).toEqual(DEFAULT_SHORTCUTS.map(entry => `foundry-navigator.${entry.action}`));
    }
    finally
    {
        await restoreShortcutRecorder(page);
    }
}

test("Alt+Shift+H returns focus to the active tab well on the current character sheet", async ({ page }) =>
{
    await joinAsTester(page);
    await logUserCharacterDiagnostics(page, TEST_ACTOR_NAME);
    const sheet = await openCharacterSheet(page, TEST_ACTOR_NAME);

    // These tab labels are shared by the default and modern Tidy 5e sheets.
    await focusShouldReturnToTab(page, sheet, "Inventory");
    await focusShouldReturnToTab(page, sheet, "Features");
});

test("Alt+Shift+H still works after changing the actor between Tidy and default sheets", async ({ page }) =>
{
    await joinAsTester(page);

    const tidySheet = await setCharacterSheetClass(
        page,
        TEST_ACTOR_NAME,
        "dnd5e.Tidy5eCharacterSheetQuadrone"
    );
    await focusShouldReturnToTab(page, tidySheet, "Inventory");

    const defaultSheet = await setCharacterSheetClass(
        page,
        TEST_ACTOR_NAME,
        "dnd5e.CharacterActorSheet"
    );
    await focusShouldReturnToTab(page, defaultSheet, "Features");
});

test("combat turn weapon picker preselects the first equipped weapon before targeting", async ({ page }) =>
{
    await joinAsTester(page);

    await setCharacterSheetClass(
        page,
        TEST_ACTOR_NAME,
        "dnd5e.Tidy5eCharacterSheetQuadrone"
    );

    const actionNames = await page.evaluate(async (actorName) =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === actorName)
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);

        actor.sheet?.render?.(true);

        globalThis.__fnCombatWeaponPromptPromise = globalThis.FoundryNavigatorCombatTunnel.promptCombatTurnWeaponSelection(
            actor.sheet,
            actor
        );

        return (actor.items?.contents ?? [])
            .filter(item =>
            {
                const weaponType = item?.system?.type?.value ?? item?.system?.type ?? "";
                const isMeleeOrRangedWeapon = /(?:M|R)$/.test(weaponType) || weaponType === "natural";
                return item?.type === "weapon" && item?.system?.equipped === true && isMeleeOrRangedWeapon;
            })
            .filter(item =>
            {
                const attackActivity = item?.system?.activities
                    ?.filter?.(activity => activity?.type === "attack" && activity?.canUse)
                    ?.[0];
                const usableActivity = item?.system?.activities
                    ?.filter?.(activity => activity?.canUse)
                    ?.[0];
                return !!attackActivity?.rollAttack || !!usableActivity?.use;
            })
            .sort((left, right) =>
                (left.name ?? "").localeCompare(right.name ?? ""))
            .map(item => item.name);
    }, TEST_ACTOR_NAME);

    expect(actionNames.length).toBeGreaterThan(0);

    const weaponPicker = page.locator(".fn-weapon-picker__form").filter({ visible: true }).last();
    await expectFocusInside(page, weaponPicker);
    await expect(page.getByRole("heading", { name: "Choose Weapon" })).toBeVisible({ timeout: 25000 });

    const firstWeaponChoice = weaponPicker.locator('input[name="fn-combat-action-choice"]').first();
    await expect(firstWeaponChoice).toBeVisible({ timeout: 25000 });
    await expect(firstWeaponChoice).toBeFocused({ timeout: 25000 });
    await expect(firstWeaponChoice).toBeChecked();
    await expect(firstWeaponChoice).toHaveAttribute("aria-label", new RegExp(actionNames[0], "i"));

    await expect(weaponPicker.locator('input[name="fn-combat-action-choice"]')).toHaveCount(actionNames.length);
    await weaponPicker.locator('button[type="submit"]').click();

    const targetPicker = await expectTargetPickerReady(page);
    await targetPicker.locator('[data-action="cancel"]').click();

    const promptResult = await page.evaluate(async () => globalThis.__fnCombatWeaponPromptPromise);
    expect(promptResult).toBe(false);
});

test("combat tunnel keeps focus anchored through targeting and damage flow", async ({ page }) =>
{
    await joinAsTester(page);
    await forceHighRolls(page);
    await lowerHostileArmorClass(page);

    const sheet = await setCharacterSheetClass(
        page,
        TEST_ACTOR_NAME,
        "dnd5e.Tidy5eCharacterSheetQuadrone"
    );

    const inventoryTab = sheet.getByRole("tab", { name: /^Inventory$/i });
    await expect(inventoryTab).toBeVisible();
    await inventoryTab.click();
    await expect(inventoryTab).toHaveAttribute("aria-selected", /true/i);

    const firstVisibleWeaponRow = sheet.locator('[data-tidy-section-key="weapon"] .tidy-table-row-container').filter({ visible: true }).first();
    await expect(firstVisibleWeaponRow).toBeVisible({ timeout: 25000 });

    const firstWeaponUseButton = firstVisibleWeaponRow.locator('.tidy-table-row-use-button');
    await expect(firstWeaponUseButton).toBeVisible({ timeout: 25000 });
    await firstWeaponUseButton.focus();
    await expect(firstWeaponUseButton).toBeFocused();

    await page.keyboard.down("Enter");

    const targetPicker = await expectTargetPickerReady(page);
    await page.keyboard.up("Enter");

    const confirmTargetButton = targetPicker.locator('button[type="submit"], .dialog-buttons button').last();
    await expect(confirmTargetButton).toBeVisible({ timeout: 25000 });
    await confirmTargetButton.click();

    const attackRollDialog = page.locator('[role="dialog"]:visible, dialog:visible').filter({ has: page.getByRole("button", { name: /Normal/i }) }).last();
    await expectFocusInside(page, attackRollDialog);
    await chooseNormalRoll(page);

    let focusReturnedAfterAttack = false;
    try
    {
        await expect(firstWeaponUseButton).toBeFocused({ timeout: 3000 });
        focusReturnedAfterAttack = true;
    }
    catch (error)
    {
        focusReturnedAfterAttack = false;
    }

    if (!focusReturnedAfterAttack)
    {
        const damageButton = page.getByRole("button", { name: /damage/i }).filter({ visible: true }).last();
        await expect(damageButton).toBeVisible({ timeout: 25000 });
        await damageButton.click();

        const damageNormalButton = page.getByRole("button", { name: /Normal/i }).filter({ visible: true }).last();
        await expect(damageNormalButton).toBeVisible({ timeout: 25000 });
        await expect(damageNormalButton).toBeFocused({ timeout: 25000 });
        await damageNormalButton.click();
    }

    await page.waitForFunction(() =>
    {
        const activeElement = document.activeElement;
        return activeElement instanceof HTMLElement
            && activeElement.classList.contains("tidy-table-row-use-button");
    }, null, { timeout: 25000 });
});

test("target lists on the seeded scene match the real tokens", async ({ page }) =>
{
    await joinAsTester(page);

    const result = await page.evaluate(async () =>
    {
        const { getActivityTargetCandidates } = await import("/modules/foundry-navigator/scripts/sheettabs/inventory-helpers.js");
        const app = { document: game.user.character };
        const names = candidates => candidates.map(candidate => candidate.token.name).sort();

        return {
            attack: names(getActivityTargetCandidates(app, { enemiesOnly: true })),
            consumable: names(getActivityTargetCandidates(app, { preferSelf: true })),
        };
    });

    expect(result.attack).toEqual(["Test Goblin"]);
    expect(result.consumable).toEqual([
        "Test Ally",
        "Test Commoner",
        "Test Downed Ally",
        "Test Goblin",
        "Tester The Brave",
    ]);
});

async function viewClearedArena(page)
{
    await page.evaluate(() => game.scenes.getName("Test Arena Cleared").view());
    await page.waitForFunction(() => window.canvas?.ready && window.canvas.scene?.name === "Test Arena Cleared");
}

// Records every write so a message that is quickly replaced still shows up.
async function recordAnnouncements(page)
{
    await page.evaluate(() =>
    {
        globalThis.__fnAnnouncements = [];
        for (const [id, level] of [["fn-aria-live-polite", "polite"], ["fn-aria-live-assertive", "assertive"]])
        {
            const region = document.getElementById(id);
            new MutationObserver(() =>
            {
                const text = region.textContent.trim();
                if (text) globalThis.__fnAnnouncements.push({ level, text });
            }).observe(region, { childList: true, characterData: true, subtree: true });
        }
    });
}

async function expectNoEnemiesAnnounced(page)
{
    await expect(page.locator("#fn-aria-live-polite")).toHaveText("No living enemies to target.");
    await expect(page.locator(".fn-target-picker__form")).toHaveCount(0);

    const rollButton = page.getByRole("button", { name: /Normal/i }).last();
    await expect(rollButton).toBeVisible({ timeout: 25000 });

    const announcements = await page.evaluate(() => globalThis.__fnAnnouncements);
    expect(announcements).toContainEqual({ level: "polite", text: "No living enemies to target." });
}

test("sheet attacks announce when no living enemies remain", async ({ page }) =>
{
    await joinAsTester(page);
    await viewClearedArena(page);

    const sheet = await setCharacterSheetClass(page, TEST_ACTOR_NAME, "dnd5e.Tidy5eCharacterSheetQuadrone");
    const inventoryTab = sheet.getByRole("tab", { name: /^Inventory$/i });
    await inventoryTab.click();
    await expect(inventoryTab).toHaveAttribute("aria-selected", /true/i);

    const useButton = sheet.locator('[data-tidy-section-key="weapon"] .tidy-table-row-container')
        .filter({ visible: true }).first().locator(".tidy-table-row-use-button");
    await useButton.focus();
    await expect(useButton).toBeFocused();

    await recordAnnouncements(page);
    await page.keyboard.press("Enter");
    await expectNoEnemiesAnnounced(page);
});

test("combat turn attacks announce when no living enemies remain", async ({ page }) =>
{
    await joinAsTester(page);
    await viewClearedArena(page);
    await setCharacterSheetClass(page, TEST_ACTOR_NAME, "dnd5e.Tidy5eCharacterSheetQuadrone");

    await recordAnnouncements(page);
    await page.evaluate(() =>
    {
        const actor = game.user.character;
        void globalThis.FoundryNavigatorCombatTunnel.promptCombatTurnWeaponSelection(actor.sheet, actor);
    });

    const weaponPicker = page.locator(".fn-weapon-picker__form").filter({ visible: true }).last();
    await expectFocusInside(page, weaponPicker);
    await weaponPicker.locator('button[type="submit"]').click();

    await expectNoEnemiesAnnounced(page);
});

async function joinAsGamemaster(page)
{
    await page.goto("/join");
    const joinForm = page.locator("#join-game-form");
    await expect(joinForm).toBeVisible({ timeout: 15000 });

    const userSelect = joinForm.locator('select[name="userid" i]');
    await userSelect.selectOption({ label: "Gamemaster" });
    await joinForm.locator('button[name="join"]').click();
    await waitForGameReady(page);
}

async function setTokenHp(page, name, value, max)
{
    await page.evaluate(async ({ name, value, max }) =>
    {
        const token = canvas.tokens.placeables.find(candidate => candidate.name === name);
        await token.actor.update({ "system.attributes.hp.max": max, "system.attributes.hp.value": value });
    }, { name, value, max });
}

async function getTokenHp(page, name)
{
    return page.evaluate(tokenName =>
        canvas.tokens.placeables.find(candidate => candidate.name === tokenName).actor.system.attributes.hp.value, name);
}

// Attacks Test Goblin from the Tidy sheet with the keyboard, through to the damage roll.
async function attackGoblinFromSheet(page)
{
    await forceHighRolls(page);
    await lowerHostileArmorClass(page);

    const sheet = await setCharacterSheetClass(page, TEST_ACTOR_NAME, "dnd5e.Tidy5eCharacterSheetQuadrone");
    const inventoryTab = sheet.getByRole("tab", { name: /^Inventory$/i });
    await inventoryTab.click();
    await expect(inventoryTab).toHaveAttribute("aria-selected", /true/i);

    const useButton = sheet.locator('[data-tidy-section-key="weapon"] .tidy-table-row-container')
        .filter({ visible: true }).first().locator(".tidy-table-row-use-button");
    await useButton.focus();
    await expect(useButton).toBeFocused();

    await page.keyboard.down("Enter");
    const targetPicker = await expectTargetPickerReady(page);
    await page.keyboard.up("Enter");
    await expect(targetPicker.locator('input[name="fn-target-choice"]')).toHaveCount(1);
    await targetPicker.locator('button[type="submit"], .dialog-buttons button').last().click();

    await chooseNormalRoll(page);

    const damageButton = page.getByRole("button", { name: /damage/i }).filter({ visible: true }).last();
    await expect(damageButton).toBeVisible({ timeout: 25000 });
    await damageButton.click();

    const damageNormalButton = page.getByRole("button", { name: /Normal/i }).filter({ visible: true }).last();
    await expect(damageNormalButton).toBeVisible({ timeout: 25000 });
    await damageNormalButton.click();

    return useButton;
}

async function getLastRollTotal(page, messageType)
{
    return page.evaluate(type =>
    {
        const message = game.messages.contents.findLast(candidate => candidate.type === type);
        return message?.rolls?.reduce((total, roll) => total + roll.total, 0) ?? null;
    }, messageType);
}

test("a full keyboard attack damages an unowned token through the connected GM", async ({ page, browser }) =>
{
    const gmContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const gmPage = await gmContext.newPage();
    const startingHp = 50;

    try
    {
        await joinAsGamemaster(gmPage);
        await setTokenHp(gmPage, "Test Goblin", startingHp, startingHp);
        await joinAsTester(page);

        const useButton = await attackGoblinFromSheet(page);

        await expect.poll(() => getTokenHp(gmPage, "Test Goblin"), { timeout: 15000 }).toBeLessThan(startingHp);

        const damage = await getLastRollTotal(page, "damage");
        expect(damage).toBeGreaterThan(0);
        expect(await getTokenHp(gmPage, "Test Goblin")).toBe(startingHp - damage);
        await expect(useButton).toBeFocused({ timeout: 25000 });
    }
    finally
    {
        await setTokenHp(gmPage, "Test Goblin", 7, 7).catch(() => undefined);
        await gmContext.close();
    }
});

test("a hit with no GM connected tells the player damage was not applied", async ({ page }) =>
{
    const message = "Damage was not applied to Test Goblin. Ask your GM to apply it.";

    await joinAsTester(page);
    await recordAnnouncements(page);
    const startingHp = await getTokenHp(page, "Test Goblin");

    const useButton = await attackGoblinFromSheet(page);

    await expect.poll(() => page.evaluate(() => globalThis.__fnAnnouncements), { timeout: 15000 })
        .toContainEqual({ level: "assertive", text: message });
    await expect(page.locator("#notifications").getByText(message)).toBeVisible();
    await expect(useButton).toBeFocused({ timeout: 25000 });
    expect(await getTokenHp(page, "Test Goblin")).toBe(startingHp);
});

const POTION = { itemName: "Potion of Healing", tabName: /^Inventory$/i, confirmName: "Use Ability" };
const CURE_WOUNDS = { itemName: "Cure Wounds", tabName: /^Spells$/i, confirmName: "Cast Spell" };

// Uses a healing item on the named token with the keyboard, through to the healing roll.
async function useHealingItemOn(page, { itemName, tabName, confirmName }, targetName)
{
    const sheet = await setCharacterSheetClass(page, TEST_ACTOR_NAME, "dnd5e.Tidy5eCharacterSheetQuadrone");
    const itemTab = sheet.getByRole("tab", { name: tabName });
    await itemTab.click();
    await expect(itemTab).toHaveAttribute("aria-selected", /true/i);

    const useButton = sheet.locator(".tidy-table-row-container").filter({ hasText: itemName })
        .filter({ visible: true }).first().locator(".tidy-table-row-use-button");
    await useButton.focus();
    await expect(useButton).toBeFocused();

    await page.keyboard.down("Enter");
    const targetPicker = await expectTargetPickerReady(page);
    await page.keyboard.up("Enter");
    await targetPicker.locator(`input[name="fn-target-choice"][aria-label^="${targetName}."]`).check();
    await targetPicker.locator('button[type="submit"], .dialog-buttons button').last().click();

    const confirmButton = page.locator(".application.activity-usage").getByRole("button", { name: confirmName });
    await expect(confirmButton).toBeFocused({ timeout: 25000 });
    await page.keyboard.press("Enter");

    const rollButton = page.locator(".application.roll-configuration").getByRole("button", { name: "Roll" });
    await expect(rollButton).toBeFocused({ timeout: 25000 });
    await page.keyboard.press("Enter");

    return useButton;
}

const getPotionQuantity = page => page.evaluate(() => game.user.character.items.getName("Potion of Healing").system.quantity);

test("a potion heals the player's own token", async ({ page }) =>
{
    await joinAsTester(page);
    await setTokenHp(page, TEST_ACTOR_NAME, 5, 20);
    const startingPotions = await getPotionQuantity(page);

    const useButton = await useHealingItemOn(page, POTION, TEST_ACTOR_NAME);

    await expect.poll(() => getTokenHp(page, TEST_ACTOR_NAME), { timeout: 15000 }).toBeGreaterThan(5);
    const healing = await getLastRollTotal(page, "healing");
    expect(healing).toBeGreaterThan(0);
    expect(await getTokenHp(page, TEST_ACTOR_NAME)).toBe(5 + healing);
    expect(await getPotionQuantity(page)).toBe(startingPotions - 1);
    await expect(useButton).toBeFocused({ timeout: 25000 });
});

test("a potion heals a downed ally through the connected GM", async ({ page, browser }) =>
{
    const gmContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const gmPage = await gmContext.newPage();
    const allyName = "Test Downed Ally";

    try
    {
        await joinAsGamemaster(gmPage);
        await setTokenHp(gmPage, allyName, 0, 50);
        await joinAsTester(page);

        const useButton = await useHealingItemOn(page, POTION, allyName);

        await expect.poll(() => getTokenHp(gmPage, allyName), { timeout: 15000 }).toBeGreaterThan(0);
        const healing = await getLastRollTotal(page, "healing");
        expect(await getTokenHp(gmPage, allyName)).toBe(healing);
        await expect(useButton).toBeFocused({ timeout: 25000 });
    }
    finally
    {
        await setTokenHp(gmPage, allyName, 0, 7).catch(() => undefined);
        await gmContext.close();
    }
});

const getSpellSlots = page => page.evaluate(() => game.user.character.system.spells.spell1.value);

test("a healing spell heals the player's own token", async ({ page }) =>
{
    await joinAsTester(page);
    await setTokenHp(page, TEST_ACTOR_NAME, 5, 20);
    const startingSlots = await getSpellSlots(page);

    const useButton = await useHealingItemOn(page, CURE_WOUNDS, TEST_ACTOR_NAME);

    await expect.poll(() => getTokenHp(page, TEST_ACTOR_NAME), { timeout: 15000 }).toBeGreaterThan(5);
    const healing = await getLastRollTotal(page, "healing");
    expect(await getTokenHp(page, TEST_ACTOR_NAME)).toBe(Math.min(5 + healing, 20));
    expect(await getSpellSlots(page)).toBe(startingSlots - 1);
    await expect(useButton).toBeFocused({ timeout: 25000 });
});

test("a healing spell heals a downed ally through the connected GM", async ({ page, browser }) =>
{
    const gmContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const gmPage = await gmContext.newPage();
    const allyName = "Test Downed Ally";

    try
    {
        await joinAsGamemaster(gmPage);
        await setTokenHp(gmPage, allyName, 0, 50);
        await joinAsTester(page);

        const useButton = await useHealingItemOn(page, CURE_WOUNDS, allyName);

        await expect.poll(() => getTokenHp(gmPage, allyName), { timeout: 15000 }).toBeGreaterThan(0);
        const healing = await getLastRollTotal(page, "healing");
        expect(await getTokenHp(gmPage, allyName)).toBe(healing);
        await expect(useButton).toBeFocused({ timeout: 25000 });
    }
    finally
    {
        await setTokenHp(gmPage, allyName, 0, 7).catch(() => undefined);
        await gmContext.close();
    }
});
