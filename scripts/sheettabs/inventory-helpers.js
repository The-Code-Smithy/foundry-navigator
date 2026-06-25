import { getInventoryRowElement, getInventoryRowName } from "./panel-navigation.js";

const FN_ITEM_ID_SELECTOR = "[data-item-id], [data-tidy-item-id]";
const FN_ITEM_UUID_SELECTOR = [
    "[data-info-card-entity-uuid]",
    "[data-uuid]",
    "[data-document-uuid]",
    "[data-item-uuid]",
    "[data-tidy-item-uuid]",
    "[data-tidy-document-uuid]",
].join(", ");

function getDatasetValue(element, keys)
{
    if (!(element instanceof HTMLElement)) return "";

    for (const key of keys)
    {
        const value = element.dataset?.[key];
        if (value) return value;
    }

    return "";
}

function getClosestOrDescendant(element, row, selector)
{
    return element.closest(selector)
        ?? (row?.matches?.(selector) ? row : null)
        ?? row?.querySelector?.(selector)
        ?? null;
}

export function getInventoryItemDocument(element, app)
{
    if (!(element instanceof HTMLElement)) return null;

    const actor = app?.document?.documentName === "Actor"
        ? app.document
        : app?.actor?.documentName === "Actor"
            ? app.actor
            : null;

    const row = getInventoryRowElement(element);
    const itemIdCarrier = getClosestOrDescendant(element, row, FN_ITEM_ID_SELECTOR);
    const itemId = getDatasetValue(itemIdCarrier, ["itemId", "tidyItemId"]);
    if (itemId && actor?.items?.get)
    {
        const item = actor.items.get(itemId);
        if (item) return item;
    }

    const uuidCarrier = getClosestOrDescendant(element, row, FN_ITEM_UUID_SELECTOR);
    const uuid = getDatasetValue(uuidCarrier, [
        "infoCardEntityUuid",
        "uuid",
        "documentUuid",
        "itemUuid",
        "tidyItemUuid",
        "tidyDocumentUuid",
    ]);
    if (uuid && typeof fromUuidSync === "function")
    {
        return fromUuidSync(uuid);
    }

    return null;
}

export function getInventoryAttackActivity(element, app)
{
    const item = getInventoryItemDocument(element, app);
    const activities = item?.system?.activities;
    if (!activities?.filter) return null;

    return activities.filter(activity => activity?.type === "attack" && activity?.canUse)?.[0] ?? null;
}

export function getInventoryUsableActivity(element, app)
{
    const item = getInventoryItemDocument(element, app);
    const activities = item?.system?.activities;
    if (!activities?.filter) return null;

    return activities.filter(activity => activity?.canUse)?.[0] ?? null;
}

export function isConsumableItemControl(element, app)
{
    const item = getInventoryItemDocument(element, app);
    return item?.type === "consumable";
}

export function getSceneActorToken(app)
{
    const actor = app?.document?.documentName === "Actor"
        ? app.document
        : app?.actor?.documentName === "Actor"
            ? app.actor
            : null;
    if (!actor || !canvas?.tokens?.placeables) return null;

    return canvas.tokens.controlled.find(token => token?.actor?.id === actor.id)
        ?? canvas.tokens.placeables.find(token => token?.actor?.id === actor.id && (token.isOwner || token.actor?.isOwner))
        ?? actor.getActiveTokens?.(true, true)?.[0]
        ?? null;
}

export function getTokenDispositionLabel(sourceToken, candidateToken)
{
    if (!candidateToken) return "unknown";
    if (sourceToken && candidateToken.id === sourceToken.id) return "self";

    const sourceDisposition = Number(sourceToken?.document?.disposition ?? 0);
    const candidateDisposition = Number(candidateToken?.document?.disposition ?? 0);

    if (candidateDisposition === 0 || sourceDisposition === 0) return "neutral";
    return sourceDisposition === candidateDisposition ? "ally" : "enemy";
}

export function getTokenDistance(sourceToken, candidateToken)
{
    if (!sourceToken || !candidateToken) return null;

    try
    {
        if (typeof canvas?.grid?.measurePath === "function")
        {
            const measurement = canvas.grid.measurePath([sourceToken.center, candidateToken.center]);
            const distance = Number(measurement?.distance);
            return Number.isFinite(distance) ? distance : null;
        }
    }
    catch
    {
        // Fall through to a simple center-to-center estimate below.
    }

    const sourceCenter = sourceToken.center;
    const candidateCenter = candidateToken.center;
    if (!sourceCenter || !candidateCenter) return null;

    const dx = Number(candidateCenter.x) - Number(sourceCenter.x);
    const dy = Number(candidateCenter.y) - Number(sourceCenter.y);
    const pixels = Math.hypot(dx, dy);
    const size = Number(canvas?.grid?.size) || 100;
    const distancePerGrid = Number(canvas?.scene?.grid?.distance) || 5;
    return Number.isFinite(pixels) ? Math.round((pixels / size) * distancePerGrid) : null;
}

export function getAttackTargetCandidates(app)
{
    if (!canvas?.tokens?.placeables?.length) return [];

    const sourceToken = getSceneActorToken(app);
    const candidates = canvas.tokens.placeables
        .filter(token => token?.document && token.actor)
        .filter(token => !token.document.hidden)
        .map(token => ({
            token,
            disposition: getTokenDispositionLabel(sourceToken, token),
            distance: getTokenDistance(sourceToken, token),
            sortOrder: getTokenDispositionLabel(sourceToken, token) === "enemy"
                ? 0
                : getTokenDispositionLabel(sourceToken, token) === "ally"
                    ? 1
                    : getTokenDispositionLabel(sourceToken, token) === "neutral"
                        ? 2
                        : 3,
        }))
        .sort((left, right) =>
        {
            if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
            const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.POSITIVE_INFINITY;
            const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.POSITIVE_INFINITY;
            if (leftDistance !== rightDistance) return leftDistance - rightDistance;
            return (left.token.name ?? "").localeCompare(right.token.name ?? "");
        });

    return candidates;
}

export function getActivityTargetCandidates(app, { preferSelf = false } = {})
{
    if (!canvas?.tokens?.placeables?.length) return [];

    const sourceToken = getSceneActorToken(app);
    return canvas.tokens.placeables
        .filter(token => token?.document && token.actor)
        .filter(token => !token.document.hidden)
        .map(token =>
        {
            const disposition = getTokenDispositionLabel(sourceToken, token);
            const distance = getTokenDistance(sourceToken, token);
            const isSelf = !!sourceToken && token.id === sourceToken.id;

            let sortOrder = 0;
            if (preferSelf)
            {
                sortOrder = isSelf
                    ? 0
                    : disposition === "ally"
                        ? 1
                        : disposition === "neutral"
                            ? 2
                            : 3;
            }
            else
            {
                sortOrder = disposition === "enemy"
                    ? 0
                    : disposition === "ally"
                        ? 1
                        : disposition === "neutral"
                            ? 2
                            : 3;
            }

            return { token, disposition, distance, sortOrder };
        })
        .sort((left, right) =>
        {
            if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
            const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.POSITIVE_INFINITY;
            const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.POSITIVE_INFINITY;
            if (leftDistance !== rightDistance) return leftDistance - rightDistance;
            return (left.token.name ?? "").localeCompare(right.token.name ?? "");
        });
}

export function clearUserTargets()
{
    for (const token of game.user?.targets ?? [])
    {
        token?.setTarget?.(false, { releaseOthers: false, user: game.user, groupSelection: false });
    }
}

export function setSingleUserTarget(token)
{
    if (!token) return false;

    clearUserTargets();
    token.setTarget?.(true, { releaseOthers: true, user: game.user, groupSelection: false });
    return true;
}

export async function waitForTargetRegistration(token, tries = 8)
{
    if (!token) return;

    while (tries-- > 0)
    {
        if (game.user?.targets?.has(token)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

export function getInventoryControlLabel(element)
{
    if (!(element instanceof HTMLElement)) return "";

    const row = getInventoryRowElement(element);
    const itemName = getInventoryRowName(row);

    if (element === row)
    {
        return itemName ? `${itemName}. Press Enter to use or roll.` : "Item row. Press Enter to use or roll.";
    }

    if (element.matches(".tidy-table-row-use-button"))
    {
        return itemName ? `Use or roll ${itemName}` : "Use or roll item";
    }

    if (element.matches(".item-name"))
    {
        return itemName ? `${itemName}. Press Enter to use or roll.` : "Item name. Press Enter to use or roll.";
    }

    if (element.matches(".item-image, .rollable"))
    {
        return itemName ? `${itemName} image. Press Enter to use or roll.` : "Item image. Press Enter to use or roll.";
    }

    if (element.matches(".item-toggle"))
    {
        return itemName ? `Toggle ${itemName}` : "Toggle item";
    }

    if (element.matches(".tidy-table-button"))
    {
        const explicitLabel = element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.dataset.tooltip;
        if (explicitLabel) return itemName ? `${explicitLabel} for ${itemName}` : explicitLabel;
        return itemName ? `Item action for ${itemName}` : "Item action";
    }

    if (element.matches(".command.decrementer"))
    {
        return itemName ? `Decrease quantity for ${itemName}` : "Decrease quantity";
    }

    if (element.matches(".command.incrementer"))
    {
        return itemName ? `Increase quantity for ${itemName}` : "Increase quantity";
    }

    if (element.matches(".quantity-tracker-input"))
    {
        return itemName ? `Quantity for ${itemName}` : "Item quantity";
    }

    return "";
}
