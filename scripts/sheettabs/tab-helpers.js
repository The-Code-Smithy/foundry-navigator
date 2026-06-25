export function getTabControls(tabList)
{
    return [...tabList.querySelectorAll(":scope > [data-tab], :scope > [data-tab-id], :scope > [role='tab']")];
}

export function getSiblingTabControls(control)
{
    const tabList = control.closest("nav.tabs[data-group], [role='tablist']");
    if (!tabList) return [];
    return getTabControls(tabList).filter(candidate => getTabId(candidate) && isFocusableElement(candidate));
}

export function getRootActiveTabId(root)
{
    if (!(root instanceof HTMLElement)) return "";

    for (const className of root.classList)
    {
        if (!className.startsWith("tab-")) continue;
        const tabId = className.slice(4);
        if (tabId) return tabId;
    }

    return "";
}

export function resolveSheetTabReturnControl(root, adapter, shiftKey = false, {
    rootClassTabId = "",
    focusedPanelTabId = "",
} = {})
{
    if (!(root instanceof HTMLElement)) return null;

    return getTabControlById(root, rootClassTabId)
        ?? getTabControlById(root, focusedPanelTabId)
        ?? getActiveTabControl(root)
        ?? getInitialSheetFocusTarget(root, shiftKey);
}

export function getTabControlById(root, tabId)
{
    if (!(root instanceof HTMLElement) || !tabId) return null;

    const selector = [
        `[role='tab'][data-tab="${CSS.escape(tabId)}"]`,
        `[role='tab'][data-tab-id="${CSS.escape(tabId)}"]`,
        `nav.tabs [data-tab="${CSS.escape(tabId)}"]`,
        `nav.tabs [data-tab-id="${CSS.escape(tabId)}"]`,
    ].join(", ");

    const control = root.querySelector(selector);
    return control instanceof HTMLElement ? control : null;
}

export function getTabId(control)
{
    return control.dataset.tabId || control.dataset.tab || "";
}

export function getPanelTabId(panel)
{
    if (!(panel instanceof HTMLElement)) return "";

    return panel.dataset.tab
        || panel.dataset.tabId
        || panel.dataset.tabContentsFor
        || "";
}

export function getTabControlFromTarget(target)
{
    const control = target.closest("[role='tab'], [data-tab], [data-tab-id]");
    if (!control) return null;
    if (!control.closest("nav.tabs[data-group], [role='tablist']")) return null;
    return control;
}

export function getTabLabel(control)
{
    return control.getAttribute("aria-label")
        || control.getAttribute("title")
        || control.textContent?.trim()
        || getTabId(control);
}

export function getSheetFocusContainer(root)
{
    return root.querySelector(".window-content, .sheet-body, .main-content") || root;
}

export function isRenderedElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.matches("[disabled], [inert], [tabindex='-1']")) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;

    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (element.getClientRects().length === 0 && style.position !== "fixed") return false;

    return true;
}

export function isFocusableElement(element)
{
    return isRenderedElement(element);
}

export function getFocusableElements(root)
{
    const selector = [
        "a[href]",
        "button",
        "input",
        "select",
        "textarea",
        "[tabindex]:not([tabindex='-1'])",
        "[contenteditable='true']",
        "[role='button']",
        "[role='tab']",
    ].join(", ");

    return [...root.querySelectorAll(selector)].filter(isFocusableElement);
}

export function getFocusedSheetPanel(root, activeElement)
{
    if (!(root instanceof HTMLElement)) return null;
    if (!(activeElement instanceof HTMLElement)) return null;

    const focusedPanel = activeElement.closest(".tab[data-tab], [role='tabpanel']");
    if (focusedPanel instanceof HTMLElement && root.contains(focusedPanel)) return focusedPanel;

    const activeTab = getActiveTabControl(root);
    const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
    if (activePanel instanceof HTMLElement) return activePanel;

    return null;
}

export function getInitialSheetFocusTarget(root, reverse = false)
{
    const activeTab = getActiveTabControl(root);
    if (activeTab) return activeTab;

    const focusables = getFocusableElements(root);
    if (!focusables.length) return getSheetFocusContainer(root);
    return reverse ? focusables.at(-1) : focusables[0];
}

export function getActiveTabControl(root)
{
    return root.querySelector("[role='tab'].active, [role='tab'][aria-selected='true']");
}

export function findTabPanel(root, control)
{
    const tabId = getTabId(control);
    if (!tabId) return null;

    const escapedId = CSS.escape(tabId);
    const candidates = [
        ...root.querySelectorAll(`[data-tab-contents-for="${escapedId}"]`),
        ...root.querySelectorAll(`.tab[data-tab="${escapedId}"]`),
    ];

    return candidates.find(panel => !panel.closest("nav.tabs, [role='tablist']")) ?? null;
}
