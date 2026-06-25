import {
    isInventoryKeyboardActionTarget,
} from "./inventory-activation.js";
import {
    focusActivationResult,
    getApplicationIdentity,
    getVisibleApplicationElements,
} from "./interaction-helpers.js";
import {
    getCurrentPanelKeyboardTarget,
    getPanelKeyboardTargets,
    getVisibleMenuContainer,
    getVisibleMenuTargets,
    isOpenInventoryMenuTrigger,
    isTextEntryElement,
} from "./panel-navigation.js";
import {
    getActiveTabControl,
    getFocusedSheetPanel,
    getInitialSheetFocusTarget,
    getTabControlFromTarget,
    getTabId,
} from "./tab-helpers.js";

function isKeyboardActivatableElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;
    if (isTextEntryElement(element)) return false;

    return element.matches(
        "button, [role='button'], [role='menuitem'], a[data-action], .button, .dialog-button, .form-footer button, .form-footer a, .roll-action, .context-item"
    );
}

export function registerGlobalSheetKeyboardRouting({
    announceSheetTabsHint,
    debugSheetTabs,
    focusFirstVisibleMenuTargetWithRetry,
    getActiveActorSheetState,
    getApplicationElement,
    getSheetAdapter,
    handleInventoryKeyboardActivation,
    setActiveActorSheet,
})
{
    window.addEventListener("keydown", event =>
    {
        const activeElement = document.activeElement;
        const eventElement = event.target instanceof HTMLElement
            ? event.target
            : event.composedPath?.().find(target => target instanceof HTMLElement) ?? null;

        if (
            (event.key === "Enter" || event.key === " ")
            && !event.ctrlKey
            && !event.altKey
            && !event.metaKey
            && eventElement instanceof HTMLElement
        )
        {
            const { app, root } = getActiveActorSheetState();
            const keyTarget = activeElement instanceof HTMLElement && root instanceof HTMLElement && root.contains(activeElement)
                ? activeElement
                : eventElement;
            if (
                app
                && root instanceof HTMLElement
                && root.contains(keyTarget)
                && !getTabControlFromTarget(keyTarget)
                && isInventoryKeyboardActionTarget(keyTarget)
            )
            {
                handleInventoryKeyboardActivation(event, app, root, "window");
                return;
            }
        }

        if (
            (event.key === "Enter" || event.key === " ")
            && !event.ctrlKey
            && !event.altKey
            && !event.metaKey
            && !getTabControlFromTarget(activeElement)
            && isKeyboardActivatableElement(activeElement)
        )
        {
            const fnDialog = activeElement?.closest?.('dialog[class*="fn-"]');
            if (fnDialog instanceof HTMLElement)
            {
                event.preventDefault();
                event.stopPropagation();
                activeElement.click();
                return;
            }

            const { root } = getActiveActorSheetState();
            const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));
            const activeWindowBeforeClick = ui?.activeWindow ?? null;
            if (
                activeElement instanceof HTMLElement
                && root instanceof HTMLElement
                && root.contains(activeElement)
                && (
                    isInventoryKeyboardActionTarget(activeElement)
                    || !!activeElement.closest(".item, .activity-row, .inventory-list, [data-item-list='inventory']")
                )
            )
            {
                debugSheetTabs("global keyboard activation skipped for sheet inventory target", {
                    activeElementTag: activeElement?.tagName,
                    activeElementClasses: activeElement?.className,
                    activeElementText: activeElement?.textContent?.trim()?.slice(0, 80),
                });
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            activeElement.click();
            if (
                activeElement instanceof HTMLElement
                && activeElement.matches(".activity-usage [data-action='use'], dialog.activity-usage [data-action='use'], .application.activity-usage [data-action='use']")
            )
            {
                focusActivationResult(previousWindowIds, {
                    originatingApp: activeWindowBeforeClick,
                    debug: debugSheetTabs,
                    getApplicationElement,
                });
            }

            debugSheetTabs("global keyboard activation clicked focused control", {
                key: event.key,
                activeElementTag: activeElement?.tagName,
                activeElementClasses: activeElement?.className,
                activeElementText: activeElement?.textContent?.trim()?.slice(0, 80),
            });
            return;
        }

        if (event.ctrlKey && event.key === "Tab")
        {
            const { app, root } = getActiveActorSheetState();
            if (!app || !root) return;

            const activeTab = getActiveTabControl(root) ?? getInitialSheetFocusTarget(root, event.shiftKey);
            if (!activeTab) return;

            event.preventDefault();
            setActiveActorSheet(app, root);
            activeTab.focus({ preventScroll: false });
            announceSheetTabsHint(app);

            debugSheetTabs("global Ctrl+Tab restored focus to sheet tab", {
                appId: app?.id,
                shiftKey: event.shiftKey,
                tabId: getTabId(activeTab),
                tabClasses: activeTab?.className,
            });
            return;
        }

        if (event.key !== "Tab") return;
        if (event.defaultPrevented) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;

        const { app, root } = getActiveActorSheetState();
        const menuContainer = getVisibleMenuContainer(root ?? document.body);
        const menuTargets = getVisibleMenuTargets(root ?? document.body);
        if (
            menuTargets.length
            && activeElement instanceof HTMLElement
            && (
                menuContainer === activeElement
                || menuContainer?.contains(activeElement)
                || menuTargets.some(target => target === activeElement || target.contains(activeElement))
                || isOpenInventoryMenuTrigger(activeElement)
            )
        )
        {
            const focusTargets = isOpenInventoryMenuTrigger(activeElement)
                ? [activeElement, ...menuTargets]
                : menuTargets;
            const currentTarget = focusTargets.find(target => target === activeElement || target.contains(activeElement))
                ?? (menuContainer === activeElement ? focusTargets[0] : null);
            const index = currentTarget ? focusTargets.indexOf(currentTarget) : -1;
            const nextIndex = index === -1
                ? 0
                : event.shiftKey
                    ? (index - 1 + focusTargets.length) % focusTargets.length
                    : (index + 1) % focusTargets.length;
            const nextTarget = focusTargets[nextIndex];

            event.preventDefault();
            event.stopPropagation();
            nextTarget.focus({ preventScroll: false });

            debugSheetTabs("global Tab cycled through visible menu targets", {
                appId: app?.id,
                fromTag: activeElement.tagName,
                fromClasses: activeElement.className,
                toTag: nextTarget?.tagName,
                toClasses: nextTarget?.className,
                shiftKey: event.shiftKey,
                targetCount: focusTargets.length,
            });
            return;
        }

        if (app && root && activeElement instanceof HTMLElement && root.contains(activeElement) && !isTextEntryElement(activeElement))
        {
            const activeTab = getActiveTabControl(root);
            const activePanel = getFocusedSheetPanel(root, activeElement);
            if (activePanel && activePanel.contains(activeElement))
            {
                const adapter = getSheetAdapter(app, root);
                const targets = getPanelKeyboardTargets(activePanel, adapter);
                if (targets.length)
                {
                    const currentTarget = getCurrentPanelKeyboardTarget(targets, activeElement);
                    const index = currentTarget ? targets.indexOf(currentTarget) : -1;
                    const nextIndex = index === -1
                        ? (event.shiftKey ? targets.length - 1 : 0)
                        : event.shiftKey
                            ? (index - 1 + targets.length) % targets.length
                            : (index + 1) % targets.length;
                    const nextTarget = targets[nextIndex];

                    event.preventDefault();
                    event.stopPropagation();
                    nextTarget.focus({ preventScroll: false });

                    debugSheetTabs("global Tab cycled between panel targets", {
                        appId: app?.id,
                        adapter: adapter.id,
                        activeTabId: getTabId(activeTab),
                        fromTag: activeElement.tagName,
                        fromClasses: activeElement.className,
                        toTag: nextTarget?.tagName,
                        toClasses: nextTarget?.className,
                        shiftKey: event.shiftKey,
                        targetCount: targets.length,
                    });
                    return;
                }
            }
        }

        if (app && root && root.contains(activeElement))
        {
            debugSheetTabs("global Tab ignored: focus already inside sheet after panel checks", {
                appId: app?.id,
                activeElementTag: activeElement?.tagName,
                activeElementClasses: activeElement?.className,
            });
            if (!isTextEntryElement(activeElement)) setActiveActorSheet(app, root);
            return;
        }

        if (!app || !root)
        {
            debugSheetTabs("global Tab ignored: no active actor sheet", {
                activeElementTag: document.activeElement?.tagName,
                activeElementClasses: document.activeElement?.className,
                activeWindowId: ui?.activeWindow?.id,
                activeWindowConstructor: ui?.activeWindow?.constructor?.name,
            });
            return;
        }

        const otherWindow = activeElement?.closest?.(".window-app, .application");
        if (otherWindow && !root.contains(otherWindow))
        {
            debugSheetTabs("global Tab ignored: focus is in another window", {
                appId: app?.id,
                otherWindowClasses: otherWindow?.className,
                activeElementTag: activeElement?.tagName,
            });
            return;
        }

        const target = getInitialSheetFocusTarget(root, event.shiftKey);
        if (!target)
        {
            debugSheetTabs("global Tab bail: no focus target inside sheet", {
                appId: app?.id,
                shiftKey: event.shiftKey,
            });
            return;
        }

        event.preventDefault();
        setActiveActorSheet(app, root);
        announceSheetTabsHint(app);
        debugSheetTabs("global Tab redirected into sheet", {
            appId: app?.id,
            shiftKey: event.shiftKey,
            targetTag: target?.tagName,
            targetClasses: target?.className,
            targetText: target?.textContent?.trim?.(),
        });
        target.focus({ preventScroll: false });
    }, true);
}
