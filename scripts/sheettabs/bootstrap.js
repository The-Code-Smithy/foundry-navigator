import {
    FN_MODULE_ID,
    FN_MODULE_SOCKET,
    FN_SHEET_HINTS_ANNOUNCED,
    FN_SHEET_TABS_STATE,
    clearActiveActorSheet,
    debugSheetTabs,
} from "./state.js";

export function registerSheetTabBootstrap({
    focusActiveActorSheetTabFromHotkey,
    enhanceActorSheetTabs,
    handleModuleSocketMessage,
    getRollTotalValue,
    getTargetArmorClass,
    openAttackResultDialog,
    handleRollDamageHook,
    registerFocusedItemUseIntercept,
})
{
    Hooks.on("init", () =>
    {
        game.keybindings.register(FN_MODULE_ID, "focusCharacterSheetTabs", {
            name: "Focus Character Sheet Tabs",
            hint: "Moves focus back to the active tab button on the current character sheet. Default: Alt+Shift+H. You can change this in Configure Controls.",
            editable: [{ key: "KeyH", modifiers: ["Alt", "Shift"] }],
            onDown: () =>
            {
                focusActiveActorSheetTabFromHotkey(false);
                return true;
            },
        });
    });

    Hooks.once("ready", () =>
    {
        game.socket?.on(FN_MODULE_SOCKET, handleModuleSocketMessage);
        registerFocusedItemUseIntercept?.();
        debugSheetTabs("registered module socket listener", {
            socket: FN_MODULE_SOCKET,
            userId: game.user?.id,
            isGM: game.user?.isGM,
            hasSocket: !!game.socket,
        });
    });

    Hooks.on("renderApplicationV2", (app, html) =>
    {
        enhanceActorSheetTabs(app, html);
    });

    Hooks.on("closeApplicationV2", app =>
    {
        debugSheetTabs("closeApplicationV2 received", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
            documentName: app?.document?.documentName,
            actorDocumentName: app?.actor?.documentName,
            title: app?.title,
        });

        if (app !== FN_SHEET_TABS_STATE.activeApp) return;

        clearActiveActorSheet("closeApplicationV2");
        FN_SHEET_HINTS_ANNOUNCED.delete(app?.id);
    });

    Hooks.on("dnd5e.postRollAttack", (rolls, data = {}) =>
    {
        const pending = FN_SHEET_TABS_STATE.pendingAttack;
        if (!pending?.targetToken) return;
        if (pending.activity && data.subject && pending.activity !== data.subject) return;

        const roll = Array.isArray(rolls) ? rolls[0] : null;
        const rollTotal = getRollTotalValue(roll);
        const ac = getTargetArmorClass(pending.targetToken);
        const hit = Number.isFinite(rollTotal) && Number.isFinite(ac) ? rollTotal >= ac : false;

        debugSheetTabs("evaluated attack result", {
            itemName: pending.itemName,
            targetName: pending.targetToken.name,
            rollTotal,
            armorClass: ac,
            hit,
        });

        openAttackResultDialog({
            activity: data.subject ?? pending.activity,
            targetToken: pending.targetToken,
            hit,
            rollTotal,
        });

        FN_SHEET_TABS_STATE.pendingAttack = null;
    });

    Hooks.on("dnd5e.rollDamage", (rolls, data = {}) => void handleRollDamageHook(rolls, data, "dnd5e.rollDamage"));
    Hooks.on("dnd5e.rollDamageV2", (rolls, data = {}) => void handleRollDamageHook(rolls, data, "dnd5e.rollDamageV2"));
}
