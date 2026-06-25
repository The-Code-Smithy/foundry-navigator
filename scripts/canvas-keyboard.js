function isEditableTarget(target)
{
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;

    return !!target.closest("input, textarea, select, button, [contenteditable='true'], [role='textbox']");
}

function collectEventElements(event)
{
    const elements = [];
    if (event.target instanceof HTMLElement) elements.push(event.target);

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const entry of path)
    {
        if (entry instanceof HTMLElement && !elements.includes(entry)) elements.push(entry);
    }

    const active = document.activeElement;
    if (active instanceof HTMLElement && !elements.includes(active)) elements.push(active);

    return elements;
}

function isCanvasContext(event)
{
    const blockedSelector = [
        ".window-app",
        ".application",
        ".app",
        ".sheet",
        "input",
        "textarea",
        "select",
        "button",
        "a",
        "[contenteditable='true']",
        "[role='textbox']",
        "[role='tab']",
        "[data-fn-inventory-keyboard-bound]",
        ".item",
        ".tidy-table-row-container",
        ".tidy-table-row"
    ].join(", ");

    return !collectEventElements(event).some(element => element.closest(blockedSelector));
}

function getKeyboardToken()
{
    if (canvas?.tokens?.hover) return canvas.tokens.hover;

    const layerHover = canvas?.activeLayer?.hover;
    if (layerHover?.documentName === "Token") return layerHover;

    const hoveredToken = canvas?.tokens?.placeables?.find(token => token.hover);
    if (hoveredToken) return hoveredToken;

    const controlled = canvas?.tokens?.controlled ?? [];
    return controlled.length === 1 ? controlled[0] : null;
}

async function openActorSheetForToken(token)
{
    if (!token?.actor?.sheet) return false;
    if (!(token.isOwner || token.actor?.isOwner)) return false;

    try
    {
        token.control?.({ releaseOthers: true });
    } catch
    {
        token.control?.();
    }

    await token.actor.sheet.render(true);
    return true;
}

function toggleTokenTarget(token)
{
    if (!token) return false;

    const nextState = !token.isTargeted;
    token.setTarget?.(nextState, {
        releaseOthers: false,
        user: game.user,
        groupSelection: false
    });
    return nextState;
}

function announceTargetChange(token, targeted)
{
    const action = targeted ? "targeted" : "no longer targeted";
    globalThis.FoundryNavigatorAnnounce?.polite?.(`${token.name ?? "Token"} ${action}.`);
}

Hooks.once("init", () =>
{
    game.keybindings.register("foundry-navigator", "toggleKeyboardTokenTarget", {
        name: "Target Hovered Token",
        hint: "Targets or untargets the hovered token. Falls back to a single controlled token. This is an alternate to Foundry's T shortcut for screen-reader users.",
        editable: [{ key: "KeyT", modifiers: ["Alt", "Shift"] }],
        onDown: () =>
        {
            const token = getKeyboardToken();
            if (!token)
            {
                globalThis.FoundryNavigatorAnnounce?.polite?.("No keyboard token available.");
                return true;
            }

            const targeted = toggleTokenTarget(token);
            announceTargetChange(token, targeted);
            return true;
        },
    });
});

window.addEventListener("keydown", event =>
{
    if (event.key !== "Enter") return;
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (collectEventElements(event).some(isEditableTarget)) return;
    if (!isCanvasContext(event)) return;

    const token = getKeyboardToken();
    if (!token) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey)
    {
        const targeted = toggleTokenTarget(token);
        announceTargetChange(token, targeted);
        return;
    }

    void openActorSheetForToken(token);
}, true);
