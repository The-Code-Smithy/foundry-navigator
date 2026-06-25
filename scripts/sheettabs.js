import { buildSheetAdapters } from "./sheettabs/adapters.js";
import { registerSheetTabBootstrap } from "./sheettabs/bootstrap.js";
import { createCombatActivationHandlers } from "./sheettabs/combat-activation.js";
import { createInventoryKeyboardHandlers } from "./sheettabs/inventory-keyboard.js";
import {
    createRollApplicationHandlers,
    getRollTotalValue,
    getTargetArmorClass,
} from "./sheettabs/roll-application.js";
import { createFocusedItemUseIntercept } from "./sheettabs/item-use-intercept.js";
import { registerGlobalSheetKeyboardRouting } from "./sheettabs/global-keyboard-routing.js";
import {
    getInventoryActionContext,
    isInventoryKeyboardActionTarget,
    resolveInventoryActivationTarget,
} from "./sheettabs/inventory-activation.js";
import {
    focusActivationResult,
} from "./sheettabs/interaction-helpers.js";
import {
    focusFirstVisibleMenuTargetWithRetry,
    getCurrentPanelKeyboardTarget,
    getFocusableElementsInPanel,
    getFocusableLikeElements,
    getPanelKeyboardTargets,
    getPreferredPanelEntryTarget,
    getVisibleMenuContainer,
    getVisibleMenuTargets,
    isExcludedPanelElement,
    isOpenInventoryMenuTrigger,
} from "./sheettabs/panel-navigation.js";
import {
    findTabPanel,
    getActiveTabControl,
    getFocusedSheetPanel,
    getPanelTabId,
    getRootActiveTabId,
    getSheetFocusContainer,
    getSiblingTabControls,
    getTabControlFromTarget,
    getTabControls,
    getTabId,
    getTabLabel,
    isRenderedElement,
    resolveSheetTabReturnControl,
} from "./sheettabs/tab-helpers.js";
import {
    FN_SHEET_HINTS_ANNOUNCED,
    FN_SHEET_TABS_STATE,
    debugSheetTabs,
    getActiveActorSheetState as getStoredActiveActorSheetState,
    getElementDebugSummary,
    registerSheetTabDebugHelpers as registerStoredSheetTabDebugHelpers,
    releaseSheetKeyboardCapture as releaseStoredSheetKeyboardCapture,
    setActiveActorSheet as setStoredActiveActorSheet,
} from "./sheettabs/state.js";

const FN_SHEET_TABS_BUILD = "image-entry-2026-05-01";
debugSheetTabs("sheettabs module loaded", { build: FN_SHEET_TABS_BUILD });

function getNavigatorSheetRoot(html)
{
    return html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
}

function getApplicationElement(app, html)
{
    const appElement = getNavigatorSheetRoot(app?.element);
    if (appElement) return appElement;
    return getNavigatorSheetRoot(html);
}

const FN_SHEET_ADAPTERS = buildSheetAdapters();

function getSheetAdapter(app, root)
{
    return FN_SHEET_ADAPTERS.find(adapter => adapter.matches(app, root)) ?? {
        id: "generic-actor-sheet",
        contentRootSelectors: [],
        entrySelectors: [],
        panelTargetSelectors: [],
    };
}

function announceSheetTabsHint(app)
{
    const appId = app?.id;
    if (!appId) return;
    if (FN_SHEET_HINTS_ANNOUNCED.has(appId)) return;

    const polite = globalThis.FoundryNavigatorAnnounce?.polite;
    if (typeof polite !== "function") return;

    FN_SHEET_HINTS_ANNOUNCED.add(appId);
    polite("Character sheet tabs. Tab moves between tabs. Press Enter to open a tab. Alt Shift H returns to tabs. Escape leaves the sheet.");

    debugSheetTabs("announced sheet tabs hint", {
        appId,
        title: app?.title,
    });
}

function resolveSheetTabReturnTarget(app, root, shiftKey = false, activeElement = document.activeElement)
{
    if (!(root instanceof HTMLElement)) return null;

    const adapter = getSheetAdapter(app, root);
    const rootClassTabId = adapter.preferRootClassTabIdForHotkey ? getRootActiveTabId(root) : "";
    const focusedPanel = getFocusedSheetPanel(root, activeElement);
    const focusedPanelTabId = getPanelTabId(focusedPanel);
    const activeTab = resolveSheetTabReturnControl(root, adapter, shiftKey, {
        rootClassTabId,
        focusedPanelTabId,
    });

    return {
        adapter,
        rootClassTabId,
        focusedPanelTabId,
        activeTab,
    };
}

function focusSheetTabReturnTarget(app, root, shiftKey = false, activeElement = document.activeElement)
{
    if (!app || !(root instanceof HTMLElement)) return false;

    const {
        adapter,
        rootClassTabId,
        focusedPanelTabId,
        activeTab,
    } = resolveSheetTabReturnTarget(app, root, shiftKey, activeElement);

    if (!(activeTab instanceof HTMLElement)) return false;

    setActiveActorSheet(app, root);
    activeTab.focus({ preventScroll: false });
    announceSheetTabsHint(app);

    debugSheetTabs("sheet tabs hotkey restored focus to active tab", {
        appId: app?.id,
        adapter: adapter.id,
        shiftKey,
        rootClassTabId,
        focusedPanelTabId,
        tabId: getTabId(activeTab),
        tabClasses: activeTab?.className,
    });
    return true;
}

function focusActiveActorSheetTabFromHotkey(shiftKey = false)
{
    const { app, root } = getActiveActorSheetState();
    if (!app || !root) return false;
    return focusSheetTabReturnTarget(app, root, shiftKey, document.activeElement);
}

function isActorSheetApplication(app, root)
{
    const result = app?.document?.documentName === "Actor"
        || root?.matches?.(".actor")
        || root?.querySelector?.(".actor-tabs, nav.tabs[data-group]");

    debugSheetTabs("isActorSheetApplication evaluated", {
        result,
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        actorDocumentName: app?.actor?.documentName,
        rootTag: root?.tagName,
        rootClasses: root?.className,
    });

    return result;
}

function debugSheetMarkup(root, app, requestedTabId = null)
{
    if (!(root instanceof HTMLElement)) return;

    const activeTab = getActiveTabControl(root);
    const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
    const requestedPanel = requestedTabId
        ? root.querySelector(`.tab[data-tab="${CSS.escape(requestedTabId)}"]`)
        : null;
    const detailsPanel = root.querySelector('[data-tab="details"]');
    const targetPanel = requestedPanel ?? activePanel ?? detailsPanel;
    if (!(targetPanel instanceof HTMLElement)) return;

    const adapter = getSheetAdapter(app, root);
    const panelTargets = getPanelKeyboardTargets(targetPanel, adapter).map(getElementDebugSummary);
    const normalizedMarkup = targetPanel.outerHTML?.replace(/\s+/g, " ");

    debugSheetTabs("sheet markup snapshot", {
        appId: app?.id,
        adapter: adapter.id,
        requestedTabId,
        activeTabId: getTabId(activeTab),
        activeTab: getElementDebugSummary(activeTab),
        panel: getElementDebugSummary(targetPanel),
        panelTargetCount: panelTargets.length,
        panelTargets: panelTargets.slice(0, 24),
        markupLength: normalizedMarkup?.length ?? 0,
    });

    console.log("[Foundry Navigator] sheet markup html");
    console.log(normalizedMarkup);

    return {
        appId: app?.id,
        adapter: adapter.id,
        requestedTabId,
        activeTabId: getTabId(activeTab),
        panelTargetCount: panelTargets.length,
        panelTargets,
        markup: normalizedMarkup,
    };
}

const {
    activateInventoryControl,
    openAttackResultDialog,
    restoreLastAttackControlFocus,
} = createCombatActivationHandlers({
    debug: debugSheetTabs,
    focusActivationResult,
    getApplicationElement,
    getTargetArmorClass,
    isRenderedElement,
    setActiveActorSheet,
});

const {
    handleModuleSocketMessage,
    handleRollDamageHook,
} = createRollApplicationHandlers({
    debug: debugSheetTabs,
    restoreLastAttackControlFocus,
});

const {
    registerFocusedItemUseIntercept,
} = createFocusedItemUseIntercept({
    activateInventoryControl,
    debug: debugSheetTabs,
    getActiveActorSheetState,
    getInventoryActionContext,
    isInventoryKeyboardActionTarget,
});

const {
    applyInventoryKeyboardSupport,
    handleInventoryKeyboardActivation,
    registerDocumentInventoryAssistiveHandlers,
} = createInventoryKeyboardHandlers({
    activateInventoryControl,
    debug: debugSheetTabs,
    focusFirstVisibleMenuTargetWithRetry,
    getActiveActorSheetState,
    isInventoryKeyboardActionTarget,
    resolveInventoryActivationTarget,
});

function getPanelEntryTarget(panel)
{
    const sheetRoot = panel.closest(".window-app, .application, .actor");
    const adapter = getSheetAdapter(FN_SHEET_TABS_STATE.activeApp, sheetRoot);
    const focusables = getFocusableElementsInPanel(panel, adapter);
    if (focusables.length) return { target: focusables[0], usedFallback: false, source: "native-focusable" };

    const preferred = getPreferredPanelEntryTarget(panel, adapter);
    if (preferred) return preferred;

    const focusableLike = getFocusableLikeElements(panel).filter(element =>
        element !== panel && !isExcludedPanelElement(element, adapter)
    );
    const firstCandidate = focusableLike.find(element => !element.matches("[tabindex='-1'], [disabled], [inert]"));
    if (firstCandidate)
    {
        if (!firstCandidate.hasAttribute("tabindex")) firstCandidate.tabIndex = 0;
        return { target: firstCandidate, usedFallback: false, source: "promoted-focusable" };
    }

    return { target: panel, usedFallback: true, source: "panel" };
}

function setActiveActorSheet(app, root)
{
    return setStoredActiveActorSheet(app, root);
}

function releaseSheetKeyboardCapture(root, reason)
{
    return releaseStoredSheetKeyboardCapture(root, reason);
}

function getActiveActorSheetState()
{
    return getStoredActiveActorSheetState({
        getApplicationElement,
        isActorSheetApplication,
    });
}

registerStoredSheetTabDebugHelpers({
    debugSheetMarkup,
    getApplicationElement,
    isActorSheetApplication,
});
registerDocumentInventoryAssistiveHandlers();

function syncTabKeyboardSupport(root, app)
{
    const tabLists = root.querySelectorAll("nav.tabs[data-group], [role='tablist']");
    let foundTabs = false;
    const appId = app?.id ?? root.dataset.appid ?? root.id ?? "sheet";
    const adapter = getSheetAdapter(app, root);

    const focusContainer = getSheetFocusContainer(root);
    if (!focusContainer.hasAttribute("tabindex")) focusContainer.tabIndex = -1;

    for (const tabList of tabLists)
    {
        const controls = getTabControls(tabList).filter(control => getTabId(control));
        if (!controls.length) continue;
        foundTabs = true;

        debugSheetTabs("syncTabKeyboardSupport found tab list", {
            appId,
            adapter: adapter.id,
            controlCount: controls.length,
            tabListClasses: tabList.className,
            tabIds: controls.map(control => getTabId(control)),
        });

        if (!tabList.hasAttribute("role")) tabList.setAttribute("role", "tablist");

        for (const control of controls)
        {
            const tabId = getTabId(control);
            const label = getTabLabel(control);
            const panel = findTabPanel(root, control);
            const isActive = control.classList.contains("active") || control.getAttribute("aria-selected") === "true";
            const controlId = control.id || `fn-tab-${appId}-${tabId}`;

            control.id = controlId;
            control.setAttribute("role", "tab");
            control.setAttribute("tabindex", "0");
            control.setAttribute("aria-selected", isActive ? "true" : "false");
            if (label) control.setAttribute("aria-label", label);

            if (!panel) continue;

            const panelId = panel.id || `fn-panel-${appId}-${tabId}`;
            panel.id = panelId;
            panel.setAttribute("role", "tabpanel");
            panel.setAttribute("aria-labelledby", controlId);
            panel.setAttribute("tabindex", "-1");
            control.setAttribute("aria-controls", panelId);
        }
    }

    debugSheetTabs("syncTabKeyboardSupport completed", {
        appId,
        adapter: adapter.id,
        foundTabs,
        tabListCount: tabLists.length,
    });

    return foundTabs;
}

function focusActivePanel(root, control)
{
    const panel = findTabPanel(root, control);
    if (!panel) return;
    const adapter = getSheetAdapter(FN_SHEET_TABS_STATE.activeApp, root);

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(() =>
        {
            const activePanel = findTabPanel(root, control) ?? panel;
            const entry = activePanel ? getPanelEntryTarget(activePanel) : { target: panel, usedFallback: true, source: "panel" };
            entry.target?.focus({ preventScroll: false });

            debugSheetTabs("focusActivePanel resolved target", {
                tabId: getTabId(control),
                adapter: adapter.id,
                panelId: activePanel?.id,
                focusedTag: entry.target?.tagName,
                focusedClasses: entry.target?.className,
                usedPanelFallback: entry.usedFallback,
                source: entry.source,
            });
        });
    });
}

function activateTabFromKeyboard(root, control, app)
{
    const isAlreadyActive = control.classList.contains("active");

    debugSheetTabs("activateTabFromKeyboard", {
        appId: app?.id,
        tabId: getTabId(control),
        label: getTabLabel(control),
        isAlreadyActive,
        ariaSelected: control.getAttribute("aria-selected"),
        controlClasses: control.className,
    });

    control.click();
    syncTabKeyboardSupport(root, app);
    focusActivePanel(root, control);
    requestAnimationFrame(() => debugSheetMarkup(root, app));
}

function attachSheetTabHandlers(root, app)
{
    if (root.dataset.fnSheetTabsBound === "true") return;
    root.dataset.fnSheetTabsBound = "true";

    const activateSheet = () => setActiveActorSheet(app, root);
    root.addEventListener("pointerdown", activateSheet, true);
    root.addEventListener("focusin", activateSheet);
    applyInventoryKeyboardSupport(root, app);

    root.addEventListener("keydown", event =>
    {
        const control = getTabControlFromTarget(event.target);
        const activeTab = getActiveTabControl(root);
        const activeElement = document.activeElement;
        const adapter = getSheetAdapter(app, root);

        if (
            adapter.localTabReturnHotkey
            && event.altKey
            && event.shiftKey
            && !event.ctrlKey
            && !event.metaKey
            && event.key.toLowerCase() === "h"
        )
        {
            event.preventDefault();
            event.stopPropagation();
            focusSheetTabReturnTarget(app, root, false, event.target);
            return;
        }

        if (event.ctrlKey && event.key === "Tab")
        {
            event.preventDefault();
            event.stopPropagation();

            if (event.shiftKey)
            {
                releaseSheetKeyboardCapture(root, "ctrl+shift+tab");
                return;
            }

            if (activeTab)
            {
                activeTab.focus({ preventScroll: false });
                debugSheetTabs("Ctrl+Tab returned focus to active tab", {
                    appId: app?.id,
                    activeTabId: getTabId(activeTab),
                    activeElementTag: activeElement?.tagName,
                    activeElementClasses: activeElement?.className,
                });
            }
            return;
        }

        if (event.key === "Escape" && root.contains(activeElement))
        {
            event.preventDefault();
            event.stopPropagation();
            releaseSheetKeyboardCapture(root, "escape");
            return;
        }

        if (!control || !root.contains(control)) return;

        debugSheetTabs("sheet keydown", {
            appId: app?.id,
            key: event.key,
            code: event.code,
            targetTag: event.target?.tagName,
            tabId: getTabId(control),
            label: getTabLabel(control),
        });

        if (event.key === "Enter" || event.key === " ")
        {
            event.preventDefault();
            event.stopPropagation();
            activateTabFromKeyboard(root, control, app);
            return;
        }

        if (event.key === "Tab")
        {
            const controls = getSiblingTabControls(control);
            const index = controls.indexOf(control);
            if (index === -1 || controls.length < 2) return;

            const nextIndex = event.shiftKey
                ? (index - 1 + controls.length) % controls.length
                : (index + 1) % controls.length;
            const nextControl = controls[nextIndex];

            event.preventDefault();
            event.stopPropagation();
            nextControl.focus({ preventScroll: false });

            debugSheetTabs("sheet Tab cycled between tab controls", {
                appId: app?.id,
                fromTabId: getTabId(control),
                toTabId: getTabId(nextControl),
                shiftKey: event.shiftKey,
                tabCount: controls.length,
                tabIds: controls.map(candidate => getTabId(candidate)),
            });
        }
    }, true);

    root.addEventListener("keydown", event =>
    {
        if (event.key !== "Tab") return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;

        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) return;
        if (!root.contains(activeElement)) return;
        if (getTabControlFromTarget(activeElement)) return;

        const menuContainer = getVisibleMenuContainer(root);
        const menuTargets = getVisibleMenuTargets(root);
        if (
            menuTargets.length
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

            debugSheetTabs("panel Tab cycled through visible menu targets", {
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

        const activeTab = getActiveTabControl(root);
        const activePanel = getFocusedSheetPanel(root, activeElement);
        if (!activePanel || !activePanel.contains(activeElement)) return;

        const adapter = getSheetAdapter(app, root);
        const targets = getPanelKeyboardTargets(activePanel, adapter);
        if (!targets.length) return;

        const currentTarget = getCurrentPanelKeyboardTarget(targets, activeElement);
        const index = currentTarget ? targets.indexOf(currentTarget) : -1;
        if (index === -1) return;

        const nextIndex = event.shiftKey
            ? (index - 1 + targets.length) % targets.length
            : (index + 1) % targets.length;
        const nextTarget = targets[nextIndex];

        event.preventDefault();
        event.stopPropagation();
        nextTarget.focus({ preventScroll: false });

        debugSheetTabs("panel Tab cycled between panel targets", {
            appId: app?.id,
            adapter: adapter.id,
            activeTabId: getTabId(activeTab),
            fromTag: currentTarget?.tagName ?? activeElement.tagName,
            fromClasses: currentTarget?.className ?? activeElement.className,
            toTag: nextTarget?.tagName,
            toClasses: nextTarget?.className,
            shiftKey: event.shiftKey,
            targetCount: targets.length,
        });

    }, true);

    root.addEventListener("click", event =>
    {
        const control = getTabControlFromTarget(event.target);
        if (!control || !root.contains(control)) return;
        requestAnimationFrame(() => syncTabKeyboardSupport(root, app));
    });

    root.addEventListener("keydown", event =>
    {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!root.contains(target)) return;
        handleInventoryKeyboardActivation(event, app, root, "root");
    }, true);

}

function enhanceActorSheetTabs(app, html)
{
    const root = getApplicationElement(app, html);
    const adapter = root ? getSheetAdapter(app, root) : null;

    debugSheetTabs("renderApplicationV2 received", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        actorDocumentName: app?.actor?.documentName,
        adapter: adapter?.id,
        title: app?.title,
        hasElement: !!app?.element,
        rootTag: root?.tagName,
        rootClasses: root?.className,
    });

    if (!root)
    {
        debugSheetTabs("enhanceActorSheetTabs bail: no root", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
        });
        return;
    }

    if (!isActorSheetApplication(app, root))
    {
        debugSheetTabs("enhanceActorSheetTabs bail: not actor sheet", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
            documentName: app?.document?.documentName,
            actorDocumentName: app?.actor?.documentName,
        });
        return;
    }

    if (!syncTabKeyboardSupport(root, app))
    {
        debugSheetTabs("enhanceActorSheetTabs bail: no sheet tabs found", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
            title: app?.title,
        });
        return;
    }

    applyInventoryKeyboardSupport(root, app);
    setActiveActorSheet(app, root);
    attachSheetTabHandlers(root, app);
    debugSheetMarkup(root, app);

    debugSheetTabs("enhanceActorSheetTabs complete", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        title: app?.title,
    });
}

registerGlobalSheetKeyboardRouting({
    announceSheetTabsHint,
    debugSheetTabs,
    focusFirstVisibleMenuTargetWithRetry,
    getCurrentPanelKeyboardTarget,
    getActiveActorSheetState,
    getApplicationElement,
    getSheetAdapter,
    handleInventoryKeyboardActivation,
    setActiveActorSheet,
});

registerSheetTabBootstrap({
    focusActiveActorSheetTabFromHotkey,
    enhanceActorSheetTabs,
    handleModuleSocketMessage,
    getRollTotalValue,
    getTargetArmorClass,
    openAttackResultDialog,
    handleRollDamageHook,
    registerFocusedItemUseIntercept,
});
