import { isRenderedElement } from "./tab-helpers.js";

function getScreenReaderAnnouncer(preferredMode = "assertive")
{
    const announcer = globalThis.FoundryNavigatorAnnounce ?? {};
    const preferred = announcer?.[preferredMode];
    if (typeof preferred === "function") return preferred;
    if (typeof announcer?.polite === "function") return announcer.polite;
    if (typeof announcer?.assertive === "function") return announcer.assertive;
    return null;
}

export function makeCombatDialogDraggable(dialog, { debug = null } = {})
{
    if (!(dialog instanceof HTMLElement) || dialog.dataset.fnDraggable === "true") return;

    const handle = dialog.querySelector(".window-header");
    if (!(handle instanceof HTMLElement)) return;

    dialog.dataset.fnDraggable = "true";
    handle.dataset.fnDragHandle = "true";
    handle.setAttribute("title", handle.getAttribute("title") || "Drag to move");

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const moveDialog = event =>
    {
        const nextLeft = clamp(startLeft + event.clientX - startX, 4, Math.max(4, window.innerWidth - dialog.offsetWidth - 4));
        const nextTop = clamp(startTop + event.clientY - startY, 4, Math.max(4, window.innerHeight - dialog.offsetHeight - 4));
        dialog.style.left = `${nextLeft}px`;
        dialog.style.top = `${nextTop}px`;
        dialog.style.margin = "0";
        dialog.style.transform = "none";
    };

    const stopDragging = event =>
    {
        handle.releasePointerCapture?.(event.pointerId);
        window.removeEventListener("pointermove", moveDialog);
        window.removeEventListener("pointerup", stopDragging);
    };

    handle.addEventListener("pointerdown", event =>
    {
        if (event.button !== 0) return;
        if (event.target?.closest?.("button, input, select, textarea, a, summary")) return;

        const rect = dialog.getBoundingClientRect();
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        dialog.style.position = "fixed";
        dialog.style.left = `${rect.left}px`;
        dialog.style.top = `${rect.top}px`;
        dialog.style.margin = "0";
        dialog.style.transform = "none";

        handle.setPointerCapture?.(event.pointerId);
        window.addEventListener("pointermove", moveDialog);
        window.addEventListener("pointerup", stopDragging, { once: true });
        event.preventDefault();

        debug?.("combat dialog drag started", {
            title: dialog.querySelector(".window-title")?.textContent?.trim(),
        });
    });
}

function getVisibleButtonLabels(root)
{
    if (!(root instanceof HTMLElement)) return [];

    const labels = [];
    for (const button of root.querySelectorAll("button"))
    {
        if (!isRenderedElement(button)) continue;
        const label = button.getAttribute("aria-label")?.trim() || button.textContent?.trim() || "";
        if (!label) continue;
        if (!labels.includes(label)) labels.push(label);
    }

    return labels;
}

function getDialogAnnouncement(root, context = {})
{
    if (!(root instanceof HTMLElement)) return "";

    const titleText = root.querySelector(".window-title")?.textContent?.trim() ?? "";
    const normalizedTitle = titleText.toLowerCase();
    const itemName = context.itemName?.trim() ?? "";
    const targetName = context.targetName?.trim() ?? "";
    const buttonLabels = getVisibleButtonLabels(root).filter(label => !/^close window$/i.test(label));

    if (context.type === "attack-roll" || normalizedTitle === "attack roll")
    {
        const intro = itemName ? `Attacking with ${itemName}.` : "Attack roll dialog opened.";
        const target = targetName ? ` Target is ${targetName}.` : "";
        const options = buttonLabels.length ? ` Options: ${buttonLabels.join(", ")}.` : "";
        return `${intro}${target} Review the attack options, then press Enter on your choice.${options}`.trim();
    }

    if (context.type === "damage-roll" || normalizedTitle === "damage roll")
    {
        const intro = itemName ? `Rolling damage for ${itemName}.` : "Damage roll dialog opened.";
        const target = targetName ? ` Target is ${targetName}.` : "";
        const options = buttonLabels.length ? ` Options: ${buttonLabels.join(", ")}.` : "";
        return `${intro}${target} Review the damage options, then press Enter on your choice.${options}`.trim();
    }

    if (context.type === "healing-roll" || normalizedTitle === "healing roll")
    {
        const intro = itemName ? `Rolling healing for ${itemName}.` : "Healing roll dialog opened.";
        const options = buttonLabels.length ? ` Options: ${buttonLabels.join(", ")}.` : "";
        return `${intro} Review the healing options, then press Enter on your choice.${options}`.trim();
    }

    return "";
}

function announceDialog(root, context = {})
{
    const announcement = getDialogAnnouncement(root, context);
    if (!announcement) return;

    const announce = getScreenReaderAnnouncer(context.mode ?? "assertive");
    announce?.(announcement);
}

function getTargetChoiceAnnouncement(candidate)
{
    const name = candidate?.token?.name ?? "Unknown target";
    const disposition = candidate?.disposition ?? "unknown";
    const distance = Number.isFinite(candidate?.distance)
        ? `${Math.round(candidate.distance)} feet away`
        : "distance unknown";

    return `${name}. ${disposition}. ${distance}.`;
}

function enhanceTargetChoiceAnnouncements(dialog, candidates)
{
    if (!(dialog instanceof HTMLElement)) return;

    const announce = getScreenReaderAnnouncer("polite");
    const inputs = [...dialog.querySelectorAll('input[name="fn-target-choice"]')];

    inputs.forEach((input, index) =>
    {
        if (!(input instanceof HTMLInputElement)) return;

        const announcement = getTargetChoiceAnnouncement(candidates[index]);
        input.setAttribute("aria-label", announcement);
        input.dataset.fnAnnouncement = announcement;

        const speak = () =>
        {
            if (typeof announce === "function") announce(announcement);
        };

        input.addEventListener("focus", speak);
        input.addEventListener("change", speak);
    });
}

export function showAccessibleTargetPicker({ app, itemName, candidates, debug = null })
{
    return new Promise(resolve =>
    {
        const dialog = document.createElement("dialog");
        dialog.className = "application fn-target-picker";
        dialog.setAttribute("aria-label", itemName ? `Choose target for ${itemName}` : "Choose target");

        const candidateMarkup = candidates.map((candidate, index) =>
        {
            const checked = index === 0 ? ' checked="checked"' : "";
            const safeName = foundry.utils.escapeHTML(candidate.token.name ?? "Unknown");
            const safeDisposition = foundry.utils.escapeHTML(candidate.disposition);
            const distanceText = Number.isFinite(candidate.distance)
                ? `${Math.round(candidate.distance)} ft`
                : "distance unknown";
            return `
                <label class="fn-target-picker__option">
                    <input type="radio" name="fn-target-choice" value="${candidate.token.id}"${checked}>
                    <span>${safeName}, ${safeDisposition}, ${foundry.utils.escapeHTML(distanceText)}</span>
                </label>
            `;
        }).join("");

        dialog.innerHTML = `
            <header class="window-header">
                <h1 class="window-title">Choose Target</h1>
                <button type="button" class="header-control icon fa-solid fa-xmark" data-action="close" aria-label="Close Window"></button>
            </header>
            <form class="window-content standard-form fn-target-picker__form" method="dialog">
                <p>Select one target for ${foundry.utils.escapeHTML(itemName || "this attack")}.</p>
                <fieldset class="fn-target-picker__list">
                    ${candidateMarkup}
                </fieldset>
                <footer class="form-footer">
                    <button type="submit" value="continue" class="default">Continue</button>
                    <button type="button" data-action="cancel">Cancel</button>
                </footer>
            </form>
        `;

        const cleanup = result =>
        {
            dialog.remove();
            resolve(result);
        };

        dialog.addEventListener("close", () =>
        {
            if (dialog.dataset.fnResolved === "true") return;
            dialog.dataset.fnResolved = "true";

            if (dialog.returnValue !== "continue")
            {
                cleanup(null);
                return;
            }

            const selectedId = dialog.querySelector('input[name="fn-target-choice"]:checked')?.value;
            const selected = candidates.find(candidate => candidate.token.id === selectedId)?.token ?? null;
            cleanup(selected);
        });

        dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => dialog.close("cancel"));
        dialog.querySelector('[data-action="cancel"]')?.addEventListener("click", () => dialog.close("cancel"));
        enhanceTargetChoiceAnnouncements(dialog, candidates);
        dialog.addEventListener("cancel", event =>
        {
            event.preventDefault();
            dialog.close("cancel");
        });

        document.body.append(dialog);
        dialog.showModal();
        makeCombatDialogDraggable(dialog, { debug });

        requestAnimationFrame(() =>
        {
            const firstChoice = dialog.querySelector('input[name="fn-target-choice"]');
            if (firstChoice instanceof HTMLElement)
            {
                firstChoice.focus({ preventScroll: false });
            }
        });

        debug?.("opened accessible target picker", {
            appId: app?.id,
            itemName,
            candidateCount: candidates.length,
            candidates: candidates.map(candidate => ({
                tokenId: candidate.token.id,
                tokenName: candidate.token.name,
                disposition: candidate.disposition,
            })),
        });
    });
}

function getCombatActionKind(item)
{
    if (item?.type === "spell") return "Spell.";
    if (item?.type === "weapon") return "Weapon.";
    return "";
}

function getCombatActionChoiceAnnouncement(item)
{
    const name = item?.name ?? "Unknown action";
    const quantity = Number(item?.system?.quantity);
    const kind = getCombatActionKind(item);
    const equipped = item?.type === "weapon" && item?.system?.equipped === true ? "Equipped." : "";
    const level = item?.type === "spell" ? getSpellLevelLabel(item) : "";
    const quantityText = Number.isFinite(quantity) && quantity > 1 ? `Quantity ${quantity}.` : "";
    return [name, kind, level, equipped, quantityText].filter(Boolean).join(" ");
}

function getPlainDescription(item)
{
    const raw = item?.system?.description?.value
        ?? item?.system?.description?.chat
        ?? "";
    if (typeof raw !== "string" || !raw.trim()) return "";

    const template = document.createElement("template");
    template.innerHTML = raw;
    return (template.content.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function getSourceLabel(item)
{
    const source = item?.system?.source;
    if (!source) return "";
    if (typeof source === "string") return source.trim();

    const book = source.book ?? source.custom ?? source.rules ?? "";
    const page = source.page ? ` p. ${source.page}` : "";
    return `${book}${page}`.trim();
}

function getSpellLevelLabel(item)
{
    const level = Number(item?.system?.level);
    if (!Number.isFinite(level)) return "";
    if (level === 0) return "Cantrip.";
    if (level === 1) return "Level 1 spell.";
    return `Level ${level} spell.`;
}

function enhanceCombatActionChoiceAnnouncements(dialog, actions)
{
    if (!(dialog instanceof HTMLElement)) return;

    const announce = getScreenReaderAnnouncer("polite");
    const inputs = [...dialog.querySelectorAll('input[name="fn-combat-action-choice"]')];

    inputs.forEach((input, index) =>
    {
        if (!(input instanceof HTMLInputElement)) return;

        const announcement = getCombatActionChoiceAnnouncement(actions[index]);
        input.setAttribute("aria-label", announcement);
        input.dataset.fnAnnouncement = announcement;

        const speak = () =>
        {
            if (typeof announce === "function") announce(announcement);
        };

        input.addEventListener("focus", speak);
        input.addEventListener("change", speak);
    });
}

export function showAccessibleWeaponPicker({ actorName, weapons, debug = null })
{
    return new Promise(resolve =>
    {
        const dialog = document.createElement("dialog");
        dialog.className = "application fn-weapon-picker";
        dialog.setAttribute("aria-label", actorName ? `Choose weapon for ${actorName}` : "Choose weapon");

        const actionMarkup = weapons.map((item, index) =>
        {
            const checked = index === 0 ? ' checked="checked"' : "";
            const safeName = foundry.utils.escapeHTML(item.name ?? "Unknown action");
            const kind = item?.type === "spell" ? " spell" : item?.type === "weapon" ? " weapon" : "";
            const equipped = item?.type === "weapon" && item?.system?.equipped === true ? " equipped" : "";
            const description = getPlainDescription(item);
            const source = getSourceLabel(item);
            const sourceText = source ? ` Source: ${source}.` : "";
            const descriptionMarkup = description
                ? `
                    <details class="fn-weapon-picker__description">
                        <summary>Description</summary>
                        <p>${foundry.utils.escapeHTML(description)}${foundry.utils.escapeHTML(sourceText)}</p>
                    </details>
                `
                : "";
            return `
                <div class="fn-weapon-picker__option">
                    <label class="fn-weapon-picker__choice">
                        <input type="radio" name="fn-combat-action-choice" value="${item.id}"${checked}>
                        <span>${safeName}${kind}${equipped}</span>
                    </label>
                    ${descriptionMarkup}
                </div>
            `;
        }).join("");

        dialog.innerHTML = `
            <header class="window-header">
                <h1 class="window-title">Choose Weapon</h1>
                <button type="button" class="header-control icon fa-solid fa-xmark" data-action="close" aria-label="Close Window"></button>
            </header>
            <form class="window-content standard-form fn-weapon-picker__form" method="dialog">
                <p>Select an equipped weapon for this turn.</p>
                <fieldset class="fn-weapon-picker__list">
                    ${actionMarkup}
                </fieldset>
                <footer class="form-footer">
                    <button type="submit" value="continue" class="default">Continue</button>
                    <button type="button" data-action="cancel">Cancel</button>
                </footer>
            </form>
        `;

        const cleanup = result =>
        {
            dialog.remove();
            resolve(result);
        };

        dialog.addEventListener("close", () =>
        {
            if (dialog.dataset.fnResolved === "true") return;
            dialog.dataset.fnResolved = "true";

            if (dialog.returnValue !== "continue")
            {
                cleanup(null);
                return;
            }

            const selectedId = dialog.querySelector('input[name="fn-combat-action-choice"]:checked')?.value;
            const selected = weapons.find(weapon => weapon.id === selectedId) ?? null;
            cleanup(selected);
        });

        dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => dialog.close("cancel"));
        dialog.querySelector('[data-action="cancel"]')?.addEventListener("click", () => dialog.close("cancel"));
        enhanceCombatActionChoiceAnnouncements(dialog, weapons);
        dialog.addEventListener("cancel", event =>
        {
            event.preventDefault();
            dialog.close("cancel");
        });

        document.body.append(dialog);
        dialog.showModal();
        makeCombatDialogDraggable(dialog, { debug });

        requestAnimationFrame(() =>
        {
            const firstChoice = dialog.querySelector('input[name="fn-combat-action-choice"]');
            if (firstChoice instanceof HTMLElement)
            {
                firstChoice.focus({ preventScroll: false });
            }
        });

        debug?.("opened accessible weapon picker", {
            actorName,
            actionCount: weapons.length,
            actions: weapons.map(item => ({
                itemId: item.id,
                itemName: item.name,
                itemType: item.type,
            })),
        });
    });
}

export function getFirstInteractiveDescendant(root)
{
    if (!(root instanceof HTMLElement)) return null;

    if (root.matches("dialog, .application"))
    {
        const titleText = root.querySelector(".window-title")?.textContent?.trim()?.toLowerCase?.() ?? "";
        if (titleText === "attack roll" || titleText === "damage roll" || titleText === "healing roll")
        {
            const normalButton = [...root.querySelectorAll("button")]
                .find(button => isRenderedElement(button) && /normal/i.test(button.textContent ?? ""));
            if (normalButton instanceof HTMLElement)
            {
                if (!normalButton.hasAttribute("tabindex")) normalButton.tabIndex = 0;
                return normalButton;
            }
        }
    }

    const selectorGroups = root.matches(".activity-usage, dialog.activity-usage")
        ? [
            [
                '.form-footer [data-action="use"]',
                '.form-footer button',
                '.window-content [data-action="use"]',
                '.window-content button',
            ].join(", "),
            [
                "dnd5e-checkbox",
                "input",
                "select",
                "textarea",
            ].join(", "),
            [
                "[data-midi-action]",
                ".dialog-button",
                ".roll-link-group",
                ".roll-action",
                "button",
                "a[href]",
                "a[data-action]",
                "[role='button']",
                "[tabindex]:not([tabindex='-1'])",
            ].join(", "),
        ]
        : root.matches("dialog, .application")
            ? [
                [
                    '.form-footer [data-action]',
                    '.form-footer button',
                    'footer [data-action]',
                    'footer button',
                    '.window-content [data-action]',
                    '.window-content button',
                    '.window-content .dialog-button',
                ].join(", "),
                [
                    "input",
                    "select",
                    "textarea",
                    "dnd5e-checkbox",
                    "[role='button']",
                    "[tabindex]:not([tabindex='-1'])",
                ].join(", "),
                [
                    "[data-midi-action]",
                    ".roll-link-group",
                    ".roll-action",
                    "button",
                    "a[href]",
                    "a[data-action]",
                ].join(", "),
            ]
            : [[
                "[data-midi-action]",
                ".dialog-button",
                ".roll-link-group",
                ".roll-action",
                "button",
                "a[href]",
                "a[data-action]",
                "[role='button']",
                "input",
                "select",
                "textarea",
                "[tabindex]:not([tabindex='-1'])",
            ].join(", ")];

    for (const selector of selectorGroups)
    {
        for (const element of root.querySelectorAll(selector))
        {
            if (!isRenderedElement(element)) continue;
            if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
            {
                element.tabIndex = 0;
            }
            return element;
        }
    }

    return null;
}

export function getVisibleApplicationElements()
{
    return [...document.querySelectorAll("dialog.application, .window-app, .application")]
        .filter(element => element instanceof HTMLElement)
        .filter(element => isRenderedElement(element));
}

export function getApplicationIdentity(element)
{
    if (!(element instanceof HTMLElement)) return "";
    return element.id || `${element.tagName}:${element.className}`;
}

export function focusActivationResult(previousWindowIds, {
    originatingApp = null,
    debug = null,
    getApplicationElement,
    announceContext = null,
} = {})
{
    let tries = 12;

    const attemptFocus = () =>
    {
        const newWindow = getVisibleApplicationElements().find(element =>
        {
            const id = getApplicationIdentity(element);
            return id && !previousWindowIds.has(id);
        });
        if (newWindow)
        {
            const windowTarget = getFirstInteractiveDescendant(newWindow);
            if (windowTarget)
            {
                windowTarget.focus({ preventScroll: false });
                announceDialog(newWindow, announceContext ?? {});
                debug?.("focused activation new window target", {
                    sourceWindowId: getApplicationIdentity(newWindow),
                    targetTag: windowTarget.tagName,
                    targetClasses: windowTarget.className,
                });
                return;
            }
        }

        const activeWindow = ui?.activeWindow;
        if (activeWindow && activeWindow !== originatingApp && !previousWindowIds.has(activeWindow.id))
        {
            const windowRoot = getApplicationElement?.(activeWindow, activeWindow?.element);
            const windowTarget = getFirstInteractiveDescendant(windowRoot);
            if (windowTarget)
            {
                windowTarget.focus({ preventScroll: false });
                announceDialog(windowRoot, announceContext ?? {});
                debug?.("focused activation window target", {
                    sourceWindowId: activeWindow.id,
                    sourceWindowClass: activeWindow.constructor?.name,
                    targetTag: windowTarget.tagName,
                    targetClasses: windowTarget.className,
                });
                return;
            }
        }

        if (--tries > 0) setTimeout(attemptFocus, 100);
    };

    setTimeout(attemptFocus, 50);
}

export function focusDialogControl(dialog, selector)
{
    if (!(dialog instanceof HTMLElement)) return;

    let tries = 8;
    const attemptFocus = () =>
    {
        if (!document.contains(dialog)) return;

        dialog.focus?.({ preventScroll: true });
        const target = dialog.querySelector(selector);
        if (target instanceof HTMLElement)
        {
            target.focus({ preventScroll: false });
            if (document.activeElement === target) return;
        }

        if (--tries > 0) setTimeout(attemptFocus, 50);
    };

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(attemptFocus);
    });
}
