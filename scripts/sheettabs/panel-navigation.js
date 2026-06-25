import { getFocusableElements, isRenderedElement } from "./tab-helpers.js";

export const FN_INVENTORY_ROW_SELECTOR = [
    ".tidy-table-row-container",
    ".tidy-table-row",
    '[data-tidy-sheet-part="item-table-row"]',
    ".item[data-item-id]",
    "[data-item-id][data-info-card-entity-uuid]",
    "[data-item-id][data-uuid]",
    "[data-item-id][data-document-uuid]",
    "[data-item-id][data-item-uuid]",
    "[data-tidy-item-id]",
    "[data-tidy-item-uuid]",
    "[data-tidy-document-uuid]",
].join(", ");

const FN_BASE_PANEL_ENTRY_SELECTORS = [
    '[data-action="roll"]',
    ".rollable",
    "button",
    "a",
];

const FN_BASE_PANEL_TARGET_SELECTORS = [
    '[data-action="roll"]',
    ".rollable",
    "[data-action]",
    "button",
    "a",
    "input",
    "select",
    "textarea",
];

export function getFocusableLikeElements(root)
{
    const selector = [
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "summary",
        "label",
        "[tabindex]",
        "[contenteditable='true']",
        "[role='button']",
        "[role='tab']",
        "[data-action]",
        ".rollable",
        ".control",
        ".item-name",
        ".activity-name",
        ".item-control",
        "[data-item-id][tabindex]",
        "[data-uuid][tabindex]",
        "[data-activity-id]",
    ].join(", ");

    return [...root.querySelectorAll(selector)].filter(element => isRenderedElement(element));
}

export function getPanelTargetRoot(panel, adapter)
{
    if (typeof adapter.resolveTargetRoot === "function")
    {
        const resolvedRoot = adapter.resolveTargetRoot(panel);
        if (resolvedRoot instanceof HTMLElement) return resolvedRoot;
    }

    if (adapter.useWholePanelForTargets) return panel;

    for (const selector of adapter.contentRootSelectors ?? [])
    {
        const match = panel.querySelector(selector);
        if (match instanceof HTMLElement) return match;
    }

    return panel;
}

export function isExcludedPanelElement(element, adapter)
{
    if (!(element instanceof HTMLElement)) return false;

    const excludedSelectors = [...new Set(adapter.excludedPanelTargetSelectors ?? [])];
    return excludedSelectors.some(selector =>
    {
        try
        {
            return element.matches(selector) || !!element.closest(selector);
        }
        catch
        {
            return false;
        }
    });
}

export function getPreferredPanelEntryTarget(panel, adapter)
{
    const targetRoot = getPanelTargetRoot(panel, {
        ...adapter,
        useWholePanelForTargets: false,
    });
    const preferredSelectors = [...adapter.entrySelectors, ...FN_BASE_PANEL_ENTRY_SELECTORS];

    for (const selector of preferredSelectors)
    {
        const candidate = [...targetRoot.querySelectorAll(selector)].find(element =>
            isRenderedElement(element)
            && !(adapter.skipInventoryRowsAsTargets && element.matches(FN_INVENTORY_ROW_SELECTOR))
            && !isExcludedPanelElement(element, adapter)
        );

        if (!candidate) continue;
        if (!candidate.hasAttribute("tabindex")) candidate.tabIndex = 0;
        return { target: candidate, usedFallback: false, source: `${adapter.id}:${selector}` };
    }

    return null;
}

export function getPanelKeyboardTargets(panel, adapter)
{
    const targetRoot = getPanelTargetRoot(panel, adapter);
    const selectors = [...adapter.panelTargetSelectors, ...FN_BASE_PANEL_TARGET_SELECTORS];
    const selector = [...new Set(selectors)].join(", ");
    const targets = [];

    for (const element of targetRoot.querySelectorAll(selector))
    {
        if (!isRenderedElement(element)) continue;
        if (adapter.skipInventoryRowsAsTargets && element.matches(FN_INVENTORY_ROW_SELECTOR)) continue;
        if (isExcludedPanelElement(element, adapter)) continue;

        if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
        {
            element.tabIndex = 0;
        }

        targets.push(element);
    }

    return targets;
}

export function getCurrentPanelKeyboardTarget(targets, activeElement)
{
    if (!(activeElement instanceof HTMLElement)) return null;
    return targets.find(target => target === activeElement)
        ?? targets.find(target => target.contains(activeElement))
        ?? null;
}

export function isTextEntryElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    return element.matches("input, textarea, select, [contenteditable='true']");
}

export function getFocusableElementsInPanel(panel, adapter = null)
{
    return getFocusableElements(panel).filter(element =>
    {
        if (element === panel) return false;
        if (!adapter) return true;
        if (adapter.skipInventoryRowsAsTargets && element.matches(FN_INVENTORY_ROW_SELECTOR)) return false;
        return !isExcludedPanelElement(element, adapter);
    });
}

export function getInventoryRowElement(element)
{
    if (!(element instanceof HTMLElement)) return null;
    return element.closest(FN_INVENTORY_ROW_SELECTOR);
}

export function getInventoryRowName(row)
{
    if (!(row instanceof HTMLElement)) return "";

    const nameElement = row.querySelector(".item-name, [data-tidy-sheet-part='table-cell'].item-label, .item-name h4");
    const text = nameElement?.textContent?.trim();
    if (text) return text;

    return row.getAttribute("aria-label") || row.dataset.itemName || "";
}

export function getInventoryPrimaryAction(element)
{
    const row = getInventoryRowElement(element);
    if (!row) return null;

    return row.querySelector(".tidy-table-row-use-button, [data-action='use'], [data-action='roll'], [data-action='useActivity'], [data-action='rollAttack'], .item-image, .item-name.item-action, .activity-name, .rollable")
        ?? row;
}

export function isLikelyInventoryMenuTrigger(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (!element.matches(".tidy-table-button, .button-icon-only, .with-options, [data-context-menu], .item-control")) return false;

    const icon = element.querySelector(".fa-ellipsis-vertical, .fa-ellipsis, .fa-bars");
    const text = element.textContent?.trim();

    return element.getAttribute("aria-haspopup") === "true"
        || element.hasAttribute("data-context-menu")
        || !!icon
        || text === "..."
        || text === "\u22EE";
}

export function isOpenInventoryMenuTrigger(element)
{
    if (!isLikelyInventoryMenuTrigger(element)) return false;

    const expanded = element.getAttribute("aria-expanded");
    if (expanded === "true") return true;

    return element.matches(".active, .open, .opened, .menu-open, [data-state='open']");
}

export function isInventoryKeyboardActionTarget(element)
{
    if (!(element instanceof HTMLElement)) return false;

    return !!element.closest(
        ".item-name, .item-action, .activity-name, .rollable, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only, [data-activity-id]"
    ) || isLikelyInventoryMenuTrigger(element);
}

export function isVisibleMenuContainer(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;
    if (element.offsetParent === null && getComputedStyle(element).position !== "fixed") return false;
    return true;
}

export function getVisibleMenuContainer(root)
{
    const queryRoots = [
        root instanceof HTMLElement ? root : null,
        document.body,
    ].filter(queryRoot => queryRoot instanceof HTMLElement);

    const containers = queryRoots.flatMap(queryRoot =>
        [...queryRoot.querySelectorAll("menu, [role='menu'], .context-menu, .dropdown-menu, .item-context-menu, .controls-dropdown")]
    ).filter(isVisibleMenuContainer);

    return containers.at(-1) ?? null;
}

export function getMenuContainerForTrigger(trigger, root)
{
    if (!(trigger instanceof HTMLElement)) return getVisibleMenuContainer(root);

    const controlsId = trigger.getAttribute("aria-controls");
    if (controlsId)
    {
        const controlled = document.getElementById(controlsId);
        if (isVisibleMenuContainer(controlled)) return controlled;
    }

    const describedById = trigger.getAttribute("aria-describedby");
    if (describedById)
    {
        const described = document.getElementById(describedById);
        if (isVisibleMenuContainer(described)) return described;
    }

    const row = getInventoryRowElement(trigger);
    const localMenu = row?.querySelector?.("menu, [role='menu'], .context-menu, .dropdown-menu, .item-context-menu, .controls-dropdown");
    if (isVisibleMenuContainer(localMenu)) return localMenu;

    return getVisibleMenuContainer(root);
}

export function getVisibleMenuTargets(root, containerOverride = null)
{
    const container = containerOverride instanceof HTMLElement ? containerOverride : getVisibleMenuContainer(root);
    if (!container) return [];

    const contextItems = [...container.querySelectorAll(".context-item, [role='menuitem']")]
        .filter(element => element instanceof HTMLElement);
    const directChildren = [...container.children].filter(element => element instanceof HTMLElement);
    const candidatePool = contextItems.length
        ? contextItems
        : directChildren.length
            ? directChildren
            : [...container.querySelectorAll("*")];

    return candidatePool
        .filter(element => element instanceof HTMLElement)
        .filter(element => !element.hidden)
        .filter(element => !element.closest("[hidden], [inert], .hidden"))
        .filter(element => element !== container)
        .filter(element => {
            const text = element.textContent?.trim();
            return !!text || element.matches("button, a, [role='menuitem']");
        })
        .map(element => {
            if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
            {
                element.tabIndex = 0;
            }
            return element;
        });
}

export function focusFirstVisibleMenuTarget(root, containerOverride = null)
{
    const container = containerOverride instanceof HTMLElement ? containerOverride : getVisibleMenuContainer(root);
    const targets = getVisibleMenuTargets(root, container);
    const firstTarget = targets[0];
    if (!firstTarget)
    {
        if (container)
        {
            if (!container.hasAttribute("tabindex")) container.tabIndex = 0;
            container.focus({ preventScroll: false });
            return true;
        }
        return false;
    }

    if (!firstTarget.hasAttribute("tabindex") && !firstTarget.matches("button, input, select, textarea, a[href]"))
    {
        firstTarget.tabIndex = 0;
    }

    firstTarget.focus({ preventScroll: false });
    return true;
}

export function focusFirstVisibleMenuTargetWithRetry(root, trigger = null, tries = 8)
{
    const attemptFocus = () =>
    {
        const container = getMenuContainerForTrigger(trigger, root);
        if (focusFirstVisibleMenuTarget(root, container)) return;
        if (tries-- <= 0) return;
        window.setTimeout(attemptFocus, 25);
    };

    attemptFocus();
}
