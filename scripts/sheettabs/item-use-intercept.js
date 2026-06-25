function itemDocumentsMatch(left, right)
{
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.uuid && right.uuid && left.uuid === right.uuid) return true;
    return !!(left.id && right.id && left.id === right.id && left.actor?.id === right.actor?.id);
}

export function createFocusedItemUseIntercept({
    activateInventoryControl,
    debug,
    getActiveActorSheetState,
    getInventoryActionContext,
    isInventoryKeyboardActionTarget,
})
{
    let registered = false;
    let bypass = false;

    function getFocusedItemUseInterceptContext(item, { debugSkips = false } = {})
    {
        const { app, root } = getActiveActorSheetState();
        if (!(app && root instanceof HTMLElement))
        {
            if (debugSkips) debug("focused item use intercept skipped: no active sheet", {
                itemName: item?.name,
                appId: app?.id,
                hasRoot: root instanceof HTMLElement,
            });
            return null;
        }

        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement) || !root.contains(activeElement))
        {
            if (debugSkips) debug("focused item use intercept skipped: focus outside sheet", {
                itemName: item?.name,
                activeTag: activeElement instanceof HTMLElement ? activeElement.tagName : undefined,
                activeClasses: activeElement instanceof HTMLElement ? activeElement.className : undefined,
            });
            return null;
        }
        if (!isInventoryKeyboardActionTarget(activeElement))
        {
            if (debugSkips) debug("focused item use intercept skipped: focus is not inventory action", {
                itemName: item?.name,
                activeTag: activeElement.tagName,
                activeClasses: activeElement.className,
                activeRole: activeElement.getAttribute("role"),
                activeDataAction: activeElement.dataset?.action,
            });
            return null;
        }

        const context = getInventoryActionContext(activeElement, app);
        if (!context?.attackActivity?.rollAttack)
        {
            if (debugSkips) debug("focused item use intercept skipped: no attack activity", {
                itemName: item?.name,
                focusedItemName: context?.itemDocument?.name,
                resolvedItemId: context?.itemDocument?.id,
                resolvedItemUuid: context?.itemDocument?.uuid,
                activityType: context?.attackActivity?.type,
                hasRollAttack: !!context?.attackActivity?.rollAttack,
            });
            return null;
        }
        if (!itemDocumentsMatch(context.itemDocument, item))
        {
            if (debugSkips) debug("focused item use intercept skipped: item mismatch", {
                itemName: item?.name,
                itemId: item?.id,
                itemUuid: item?.uuid,
                focusedItemName: context?.itemDocument?.name,
                focusedItemId: context?.itemDocument?.id,
                focusedItemUuid: context?.itemDocument?.uuid,
            });
            return null;
        }

        const activationTarget = context.activationTarget instanceof HTMLElement
            ? context.activationTarget
            : activeElement;

        return { app, root, activeElement, activationTarget, context };
    }

    async function interceptFocusedItemUse(item, args)
    {
        if (bypass) return false;

        const interceptContext = getFocusedItemUseInterceptContext(item, { debugSkips: true });
        if (!interceptContext) return false;

        debug("intercepted focused item use for combat tunnel", {
            appId: interceptContext.app?.id,
            itemName: item?.name,
            focusedTag: interceptContext.activeElement.tagName,
            focusedClasses: interceptContext.activeElement.className,
            activationTag: interceptContext.activationTarget.tagName,
            activationClasses: interceptContext.activationTarget.className,
        });

        bypass = true;
        try
        {
            const event = args.find(arg => arg instanceof Event)
                ?? args.find(arg => arg?.event instanceof Event)?.event
                ?? null;
            await activateInventoryControl(interceptContext.activationTarget, interceptContext.app, event);
        }
        finally
        {
            bypass = false;
        }

        return true;
    }

    function registerFocusedItemUseIntercept()
    {
        if (registered) return;

        const itemClass = CONFIG?.Item?.documentClass;
        const originalUse = itemClass?.prototype?.use;
        if (typeof originalUse !== "function")
        {
            debug("focused item use intercept skipped: Item.use unavailable");
            return;
        }

        if (globalThis.libWrapper?.register)
        {
            globalThis.libWrapper.register(
                "foundry-navigator",
                "CONFIG.Item.documentClass.prototype.use",
                async function foundryNavigatorFocusedItemUseWrapper(wrapped, ...args)
                {
                    if (await interceptFocusedItemUse(this, args)) return null;
                    return wrapped(...args);
                },
                "MIXED"
            );
        }
        else
        {
            itemClass.prototype.use = async function foundryNavigatorFocusedItemUseWrapper(...args)
            {
                if (await interceptFocusedItemUse(this, args)) return null;
                return originalUse.apply(this, args);
            };
        }

        registered = true;
        debug("registered focused item use intercept", {
            viaLibWrapper: !!globalThis.libWrapper?.register,
        });
    }

    return { registerFocusedItemUseIntercept };
}