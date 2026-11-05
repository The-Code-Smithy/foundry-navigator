const { test, expect } = require("@playwright/test");

// Foundry locks globals such as canvas once a world is active, so tests that
// fake them run on an empty page served from the same origin.
async function gotoBlankPage(page)
{
    await page.route("**/fn-test-blank", route => route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Foundry Navigator test page</title>",
    }));
    await page.goto("/fn-test-blank");
}

test("roll application helpers read Foundry roll totals defensively", async ({ page }) =>
{
    await page.goto("/join");

    const totals = await page.evaluate(async () =>
    {
        const module = await import("/modules/foundry-navigator/scripts/sheettabs/roll-application.js");
        return {
            direct: module.getRollTotalValue({ total: 17, result: { total: 99 }, _total: 88 }),
            result: module.getRollTotalValue({ total: undefined, result: { total: "14" }, _total: 88 }),
            privateTotal: module.getRollTotalValue({ total: undefined, result: {}, _total: "12" }),
            invalid: module.getRollTotalValue({ total: undefined, result: {}, _total: undefined }),
            armorClassValue: module.getTargetArmorClass({ actor: { system: { attributes: { ac: { value: 16 } } } } }),
            armorClassFlat: module.getTargetArmorClass({ actor: { system: { attributes: { ac: { flat: 13 } } } } }),
        };
    });

    expect(totals.direct).toBe(17);
    expect(totals.result).toBe(14);
    expect(totals.privateTotal).toBe(12);
    expect(Number.isNaN(totals.invalid)).toBe(true);
    expect(totals.armorClassValue).toBe(16);
    expect(totals.armorClassFlat).toBe(13);
});

test("focused item-use intercept only captures the matching focused attack item", async ({ page }) =>
{
    await gotoBlankPage(page);

    const result = await page.evaluate(async () =>
    {
        const { createFocusedItemUseIntercept } = await import("/modules/foundry-navigator/scripts/sheettabs/item-use-intercept.js");

        const previousConfig = globalThis.CONFIG;
        const previousLibWrapper = globalThis.libWrapper;
        const root = document.createElement("section");
        const button = document.createElement("button");
        root.append(button);
        document.body.append(root);
        button.focus();

        class FakeItem
        {
            constructor(item)
            {
                Object.assign(this, item);
            }

            async use(...args)
            {
                return { original: true, argsLength: args.length };
            }
        }

        const focusedItem = { id: "item-1", uuid: "Actor.actor-1.Item.item-1", actor: { id: "actor-1" }, name: "Battleaxe" };
        const mismatchItem = { id: "item-2", uuid: "Actor.actor-1.Item.item-2", actor: { id: "actor-1" }, name: "Dagger" };
        const debugMessages = [];
        const activations = [];

        try
        {
            globalThis.game = { settings: { get: () => true } };
            globalThis.CONFIG = { Item: { documentClass: FakeItem } };
            globalThis.libWrapper = null;

            const { registerFocusedItemUseIntercept } = createFocusedItemUseIntercept({
                activateInventoryControl: async (target, app, event) =>
                {
                    activations.push({
                        targetMatches: target === button,
                        appId: app?.id,
                        eventType: event?.type ?? null,
                    });
                },
                debug: (message, details) => debugMessages.push({ message, details }),
                getActiveActorSheetState: () => ({ app: { id: "app-1" }, root }),
                getInventoryActionContext: () => ({
                    activationTarget: button,
                    itemDocument: focusedItem,
                    attackActivity: { type: "attack", rollAttack: () => undefined },
                }),
                isInventoryKeyboardActionTarget: element => element === button,
            });

            registerFocusedItemUseIntercept();

            const intercepted = await new FakeItem(focusedItem).use(new Event("keydown"));
            const original = await new FakeItem(mismatchItem).use("manual");

            return {
                intercepted,
                original,
                activations,
                registered: debugMessages.some(entry => entry.message === "registered focused item use intercept"),
                mismatchLogged: debugMessages.some(entry => entry.message.includes("item mismatch")),
            };
        }
        finally
        {
            root.remove();
            globalThis.CONFIG = previousConfig;
            globalThis.libWrapper = previousLibWrapper;
        }
    });

    expect(result.intercepted).toBeNull();
    expect(result.original).toEqual({ original: true, argsLength: 1 });
    expect(result.activations).toEqual([{ targetMatches: true, appId: "app-1", eventType: "keydown" }]);
    expect(result.registered).toBe(true);
    expect(result.mismatchLogged).toBe(true);
});

test("target candidates exclude non-enemies from attacks and defeated enemies everywhere", async ({ page }) =>
{
    await gotoBlankPage(page);

    const result = await page.evaluate(async () =>
    {
        const { getActivityTargetCandidates } = await import("/modules/foundry-navigator/scripts/sheettabs/inventory-helpers.js");

        const previousCanvas = globalThis.canvas;
        const previousConfig = globalThis.CONFIG;
        const previousConst = globalThis.CONST;

        const FRIENDLY = 1;
        const NEUTRAL = 0;
        const HOSTILE = -1;

        const makeToken = (name, disposition, { hp = { value: 10, max: 10 }, statuses = [], combatantDefeated = false, hidden = false, type = "npc" } = {}) => ({
            id: name,
            name,
            center: { x: 0, y: 0 },
            document: { disposition, hidden, combatant: { isDefeated: combatantDefeated } },
            actor: { id: name, type, statuses: new Set(statuses), system: { attributes: { hp } } },
        });

        const hero = makeToken("Hero", FRIENDLY, { type: "character" });
        const app = { document: { documentName: "Actor", id: "Hero" } };
        const names = candidates => candidates.map(candidate => candidate.token.name).sort();
        const setScene = (placeables, controlled) =>
        {
            globalThis.canvas = { tokens: { placeables, controlled }, grid: { size: 100 }, scene: { grid: { distance: 5 } } };
        };

        try
        {
            globalThis.CONFIG = { specialStatusEffects: { DEFEATED: "dead" } };
            globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY, NEUTRAL, HOSTILE } };

            setScene([
                hero,
                makeToken("Downed Ally", FRIENDLY, { hp: { value: 0, max: 20 } }),
                makeToken("Shopkeeper", NEUTRAL),
                makeToken("Goblin", HOSTILE),
                makeToken("Zero HP Goblin", HOSTILE, { hp: { value: 0, max: 7 } }),
                makeToken("Status Dead Goblin", HOSTILE, { statuses: ["dead"] }),
                makeToken("Combat Defeated Goblin", HOSTILE, { combatantDefeated: true }),
                makeToken("No HP Tracking Construct", HOSTILE, { hp: { value: 0, max: 0 } }),
                makeToken("Hidden Goblin", HOSTILE, { hidden: true }),
            ], [hero]);

            const attack = names(getActivityTargetCandidates(app, { enemiesOnly: true }));
            const consumable = names(getActivityTargetCandidates(app, { preferSelf: true }));

            // No token for the attacking actor on this scene.
            setScene([makeToken("Goblin", HOSTILE), makeToken("Ally", FRIENDLY)], []);
            const attackWithoutSource = getActivityTargetCandidates(app, { enemiesOnly: true })
                .map(candidate => [candidate.token.name, candidate.disposition]);

            setScene([hero, makeToken("Zero HP Goblin", HOSTILE, { hp: { value: 0, max: 7 } })], [hero]);
            const attackAllDead = names(getActivityTargetCandidates(app, { enemiesOnly: true }));

            // A GM attacking from an NPC: downed PCs are dying, not dead.
            const ogre = makeToken("Ogre", HOSTILE);
            setScene([
                ogre,
                makeToken("Downed PC", FRIENDLY, { hp: { value: 0, max: 20 }, type: "character" }),
                makeToken("Dead PC", FRIENDLY, { hp: { value: 0, max: 20 }, statuses: ["dead"], type: "character" }),
            ], [ogre]);
            const npcAttack = names(getActivityTargetCandidates({ document: { documentName: "Actor", id: "Ogre" } }, { enemiesOnly: true }));

            return { attack, consumable, attackWithoutSource, attackAllDead, npcAttack };
        }
        finally
        {
            globalThis.canvas = previousCanvas;
            globalThis.CONFIG = previousConfig;
            globalThis.CONST = previousConst;
        }
    });

    expect(result.attack).toEqual(["Goblin", "No HP Tracking Construct"]);
    expect(result.consumable).toEqual(["Downed Ally", "Goblin", "Hero", "No HP Tracking Construct", "Shopkeeper"]);
    expect(result.attackWithoutSource).toEqual([["Goblin", "enemy"]]);
    expect(result.attackAllDead).toEqual([]);
    expect(result.npcAttack).toEqual(["Downed PC"]);
});
