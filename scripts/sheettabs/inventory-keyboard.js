import { getInventoryControlLabel } from "./inventory-helpers.js";
import {
    getInventoryRowElement,
    getInventoryRowName,
    isLikelyInventoryMenuTrigger,
} from "./panel-navigation.js";

let fnLastPointerDownTime = 0;
let fnLastKeyboardActivationTime = 0;
let fnLastKeyboardActivationTarget = null;
let fnDocumentInventoryAssistiveHandlersRegistered = false;

export function createInventoryKeyboardHandlers({
    activateInventoryControl,
    debug,
    focusFirstVisibleMenuTargetWithRetry,
    getActiveActorSheetState,
    isInventoryKeyboardActionTarget,
    resolveInventoryActivationTarget,
})
{
    function handleInventoryKeyboardActivation(event, app, root, source = "direct")
    {
        if (event.ctrlKey || event.altKey || event.metaKey) return false;
        if (event.key !== "Enter" && event.key !== " ") return false;

        const eventTarget = event.target instanceof HTMLElement
            ? event.target
            : event.composedPath?.().find(target => target instanceof HTMLElement) ?? null;
        const currentTarget = event.currentTarget instanceof HTMLElement
            ? event.currentTarget
            : null;
        const target = currentTarget
            && currentTarget !== root
            && isInventoryKeyboardActionTarget(currentTarget)
                ? currentTarget
                : eventTarget;
        if (!(target instanceof HTMLElement)) return false;
        if (!(root instanceof HTMLElement) || !root.contains(target)) return false;
        if (!isInventoryKeyboardActionTarget(target)) return false;

        const {
            resolvedTarget = target,
            activationTarget = target,
        } = resolveInventoryActivationTarget(target);

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        fnLastKeyboardActivationTime = Date.now();
        fnLastKeyboardActivationTarget = activationTarget;
        void activateInventoryControl(activationTarget, app, event);

        if (isLikelyInventoryMenuTrigger(resolvedTarget))
        {
            requestAnimationFrame(() => focusFirstVisibleMenuTargetWithRetry(root, resolvedTarget));
        }

        debug(`${source} inventory keyboard action activated`, {
            appId: app?.id,
            itemName: getInventoryRowName(getInventoryRowElement(target)),
            targetTag: target.tagName,
            targetClasses: target.className,
            resolvedTargetTag: resolvedTarget?.tagName,
            resolvedTargetClasses: resolvedTarget?.className,
            activationTargetTag: activationTarget?.tagName,
            activationTargetClasses: activationTarget?.className,
            key: event.key,
        });
        return true;
    }

    function handleAssistiveInventoryClick(event, app, root, source = "assistive")
    {
        if (event.defaultPrevented) return false;

        const target = event.target instanceof HTMLElement
            ? event.target
            : event.composedPath?.().find(candidate => candidate instanceof HTMLElement) ?? null;
        if (!(target instanceof HTMLElement)) return false;
        if (!(root instanceof HTMLElement) || !root.contains(target)) return false;
        if (!isInventoryKeyboardActionTarget(target)) return false;

        const sincePointerDown = Date.now() - fnLastPointerDownTime;
        if (sincePointerDown >= 0 && sincePointerDown < 750) return false;

        const {
            resolvedTarget = target,
            activationTarget = target,
        } = resolveInventoryActivationTarget(target);

        if (isLikelyInventoryMenuTrigger(resolvedTarget)) return false;

        const sinceKeyboardActivation = Date.now() - fnLastKeyboardActivationTime;
        if (
            sinceKeyboardActivation >= 0
            && sinceKeyboardActivation < 750
            && (
                fnLastKeyboardActivationTarget === activationTarget
                || fnLastKeyboardActivationTarget?.contains?.(activationTarget)
                || activationTarget?.contains?.(fnLastKeyboardActivationTarget)
            )
        )
        {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            return true;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        void activateInventoryControl(activationTarget, app, event);

        debug(`${source} inventory assistive click activated`, {
            appId: app?.id,
            itemName: getInventoryRowName(getInventoryRowElement(target)),
            targetTag: target.tagName,
            targetClasses: target.className,
            resolvedTargetTag: resolvedTarget?.tagName,
            resolvedTargetClasses: resolvedTarget?.className,
            activationTargetTag: activationTarget?.tagName,
            activationTargetClasses: activationTarget?.className,
            eventDetail: event.detail,
            isTrusted: event.isTrusted,
        });
        return true;
    }

    function applyInventoryKeyboardSupport(root, app)
    {
        for (const header of root.querySelectorAll(".items-header, .items-header .item-name, .items-header .item-header"))
        {
            if (!(header instanceof HTMLElement)) continue;
            if (header.getAttribute("tabindex") === "0") header.removeAttribute("tabindex");
        }

        for (const image of root.querySelectorAll(".tidy-table-row-use-button .item-image"))
        {
            if (!(image instanceof HTMLElement)) continue;
            if (image.getAttribute("tabindex") === "0") image.removeAttribute("tabindex");
        }

        const controls = root.querySelectorAll(
            ".item-name, .item-action, .activity-name, .rollable, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only, .quantity-tracker-input, [data-activity-id]"
        );

        for (const control of controls)
        {
            if (!(control instanceof HTMLElement)) continue;
            if (control.closest(".items-header")) continue;
            if (control.dataset.fnInventoryKeyboardBound !== "true")
            {
                control.addEventListener("keydown", event =>
                {
                    handleInventoryKeyboardActivation(event, app, root, "direct");
                }, true);
                control.dataset.fnInventoryKeyboardBound = "true";
            }

            const label = getInventoryControlLabel(control);
            if (label && !control.getAttribute("aria-label")) control.setAttribute("aria-label", label);
            if (control.matches(".tidy-table-row-use-button") && !control.getAttribute("role"))
            {
                control.setAttribute("role", "button");
            }

            if (
                (control.matches(".item-name, .item-action, .activity-name, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only, [data-activity-id]")
                    || control.matches(".rollable")
                    || isLikelyInventoryMenuTrigger(control))
                && !control.hasAttribute("tabindex")
                && !control.matches("button, input, select, textarea, a[href]")
            )
            {
                control.tabIndex = 0;
            }
        }
    }

    function registerDocumentInventoryAssistiveHandlers()
    {
        if (fnDocumentInventoryAssistiveHandlersRegistered) return;
        fnDocumentInventoryAssistiveHandlersRegistered = true;

        document.addEventListener("pointerdown", () =>
        {
            fnLastPointerDownTime = Date.now();
        }, true);

        document.addEventListener("click", event =>
        {
            const { app, root } = getActiveActorSheetState();
            if (app && root instanceof HTMLElement)
            {
                handleAssistiveInventoryClick(event, app, root, "document");
            }
        }, true);
    }

    return {
        applyInventoryKeyboardSupport,
        handleAssistiveInventoryClick,
        handleInventoryKeyboardActivation,
        registerDocumentInventoryAssistiveHandlers,
    };
}
