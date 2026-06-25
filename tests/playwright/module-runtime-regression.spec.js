const { test, expect } = require("@playwright/test");

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
    await page.goto("/join");

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