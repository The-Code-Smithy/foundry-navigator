import {
    getInventoryAttackActivity,
    getInventoryItemDocument,
    getInventoryUsableActivity,
    isConsumableItemControl,
} from "./inventory-helpers.js";
import {
    getInventoryPrimaryAction,
    getInventoryRowElement,
    getInventoryRowName,
    isLikelyInventoryMenuTrigger,
} from "./panel-navigation.js";

export const FN_INVENTORY_ACTION_ROOT_SELECTOR = [
    ".item-name",
    ".item-image",
    ".item-action",
    ".activity-name",
    ".rollable",
    ".tidy-table-row-use-button",
    ".item-toggle",
    ".command.decrementer",
    ".command.incrementer",
    ".tidy-table-button",
    ".button.button-icon-only",
    "[data-action='use']",
    "[data-action='roll']",
    "[data-action='useActivity']",
    "[data-action='rollAttack']",
    "[data-action='rollDamage']",
    "[data-activity-id]",
    "[data-context-menu]",
    ".item-control",
].join(", ");

const FN_INVENTORY_PRIMARY_TRIGGER_SELECTOR = [
    ".item-name",
    ".item-image",
    ".item-action",
    ".activity-name",
    ".rollable",
    ".tidy-table-row-use-button",
    "[data-action='use']",
    "[data-action='roll']",
    "[data-action='useActivity']",
    "[data-action='rollAttack']",
    "[data-action='rollDamage']",
    "[data-activity-id]",
].join(", ");

export function getInventoryActionRoot(element)
{
    if (!(element instanceof HTMLElement)) return null;
    return element.closest(FN_INVENTORY_ACTION_ROOT_SELECTOR);
}

export function isInventoryKeyboardActionTarget(element)
{
    if (!(element instanceof HTMLElement)) return false;
    return !!getInventoryActionRoot(element) || isLikelyInventoryMenuTrigger(element);
}

export function resolveInventoryActivationTarget(element)
{
    if (!(element instanceof HTMLElement)) return { resolvedTarget: null, activationTarget: null };

    const resolvedTarget = getInventoryActionRoot(element) ?? element;
    const activationTarget = resolvedTarget.matches(FN_INVENTORY_PRIMARY_TRIGGER_SELECTOR)
        ? (getInventoryPrimaryAction(resolvedTarget) ?? resolvedTarget)
        : resolvedTarget;

    return {
        resolvedTarget,
        activationTarget,
    };
}

export function getInventoryActionContext(element, app)
{
    if (!(element instanceof HTMLElement)) return null;

    const { resolvedTarget, activationTarget } = resolveInventoryActivationTarget(element);
    const target = activationTarget ?? resolvedTarget ?? element;
    const row = getInventoryRowElement(target);
    const itemName = getInventoryRowName(row);

    return {
        sourceTarget: element,
        resolvedTarget,
        activationTarget: target,
        row,
        itemName,
        itemDocument: getInventoryItemDocument(target, app),
        attackActivity: getInventoryAttackActivity(target, app),
        usableActivity: getInventoryUsableActivity(target, app),
        isConsumable: isConsumableItemControl(target, app),
    };
}
