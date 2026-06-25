const ICON_LABELS = {
    "fa-trash": "Delete",
    "fa-edit": "Edit",
    "fa-pencil": "Edit",
    "fa-pen": "Edit",
    "fa-eye": "View",
    "fa-eye-slash": "Hide",
    "fa-plus": "Add",
    "fa-minus": "Remove",
    "fa-times": "Close",
    "fa-xmark": "Close",
    "fa-check": "Confirm",
    "fa-cog": "Settings",
    "fa-gear": "Settings",
    "fa-search": "Search",
    "fa-magnifying-glass": "Search",
    "fa-arrows-alt": "Move",
    "fa-up-down-left-right": "Move",
    "fa-copy": "Duplicate",
    "fa-clone": "Duplicate",
    "fa-share-alt": "Share",
    "fa-share-nodes": "Share",
    "fa-lock": "Lock",
    "fa-unlock": "Unlock",
    "fa-chevron-up": "Collapse",
    "fa-chevron-down": "Expand",
    "fa-chevron-left": "Previous",
    "fa-chevron-right": "Next",
    "fa-user": "Actor",
    "fa-suitcase": "Inventory",
    "fa-dice-d20": "Roll",
    "fa-fist-raised": "Actions",
    "fa-hand-fist": "Actions",
    "fa-compress": "Shrink",
    "fa-expand": "Expand",
    "fa-link": "Link",
    "fa-unlink": "Unlink",
    "fa-link-slash": "Unlink",
    "fa-upload": "Upload",
    "fa-download": "Download",
    "fa-rotate": "Refresh",
    "fa-arrows-rotate": "Refresh",
    "fa-star": "Favorite",
    "fa-bookmark": "Bookmark",
    "fa-crosshairs": "Target",
    "fa-map": "Map",
    "fa-music": "Sound",
    "fa-volume-up": "Volume Up",
    "fa-volume-down": "Volume Down",
    "fa-volume-xmark": "Mute",
    "fa-volume-mute": "Mute"
};

function labelFromIcon(className)
{
    for (const [iconClass, label] of Object.entries(ICON_LABELS))
    {
        if (className.includes(iconClass)) return label;
    }
    return "";
}

function labelImages(root)
{
    for (const image of root.querySelectorAll("img:not([alt])"))
    {
        const tooltip = image.getAttribute("data-tooltip") || image.getAttribute("title") || "";
        const dataName = image.getAttribute("data-name") || "";
        const ancestorLabel = image.closest("[aria-label]")?.getAttribute("aria-label") || "";
        const nearbyText = image.closest("li, header, .window-header")
            ?.querySelector(".name, .item-name, .document-name, h3, h4, h5")
            ?.textContent?.trim() || "";

        image.setAttribute("alt", tooltip || dataName || nearbyText || ancestorLabel || "");
    }
}

function labelControls(root)
{
    const controls = root.querySelectorAll(
        "button:not([aria-label]), a[data-action]:not([aria-label]), a.control:not([aria-label])"
    );

    for (const control of controls)
    {
        const tooltip = control.getAttribute("data-tooltip") || control.getAttribute("title") || "";
        if (tooltip)
        {
            control.setAttribute("aria-label", tooltip);
            continue;
        }

        if (control.textContent?.trim()) continue;

        const icon = control.querySelector("i[class], span[class*='fa']");
        const iconLabel = icon ? labelFromIcon(icon.className) : "";
        if (iconLabel) control.setAttribute("aria-label", iconLabel);
    }
}

function applyUiLabels(root)
{
    const scope = root instanceof HTMLElement ? root : document;

    for (const element of scope.querySelectorAll("[title]:not([aria-label])"))
    {
        element.setAttribute("aria-label", element.getAttribute("title"));
    }

    for (const element of scope.querySelectorAll("[data-tooltip]:not([aria-label])"))
    {
        element.setAttribute("aria-label", element.getAttribute("data-tooltip"));
    }

    labelImages(scope);
    labelControls(scope);
}

Hooks.on("renderApplication", (app, html) =>
{
    const root = html instanceof HTMLElement ? html : html?.[0];
    applyUiLabels(root);
});

Hooks.on("renderApplicationV2", (app, html) =>
{
    applyUiLabels(html);
});

Hooks.on("renderSidebar", (app, html) =>
{
    const root = html instanceof HTMLElement ? html : html?.[0];
    applyUiLabels(root);
});
