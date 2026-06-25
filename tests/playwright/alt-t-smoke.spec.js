const { test, expect } = require("@playwright/test");

const TEST_USER_NAME = "Tester The Brave";
const TEST_ACTOR_NAME = "Tester The Brave";

test.beforeEach(async ({ page }) =>
{
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

        const userSelect = joinForm.locator('select[name="userid"]');
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

        await actor.setFlag("core", "sheetClass", desiredSheetClass);
        actor.sheet?.close?.();
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








