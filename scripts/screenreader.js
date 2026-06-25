/**
 * screenreader.js - Screen reader support for Foundry Navigator
 *
 * Creates two off-screen ARIA live regions and announces:
 *   - Chat messages (polite; reads after the user finishes what they're doing)
 *   - Combat turn changes (polite for others, assertive for your own turn)
 *   - Foundry UI notifications: info/warning (polite), error (assertive)
 *
 * All features are off by default and can be enabled per-client in module settings.
 */

// ---------------------------------------------------------------------------
// Settings registration
// ---------------------------------------------------------------------------

Hooks.on("init", () =>
{

    game.settings.register('foundry-navigator', 'announceChatMessages', {
        name: 'Announce Chat Messages',
        hint: 'Screen reader will announce incoming chat messages as they arrive.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceRollResults', {
        name: 'Announce Roll Results',
        hint: 'Screen reader announces dice roll flavor and totals when roll cards appear in chat.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceCombatTurns', {
        name: 'Announce Combat Turns',
        hint: 'Screen reader announces when the active combatant changes. You will get a louder alert when it is your own turn.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceNotifications', {
        name: 'Announce UI Notifications',
        hint: 'Screen reader announces Foundry info/warning/error pop-up notifications.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceTokenMove', {
        name: 'Announce Token Movement',
        hint: 'Screen reader announces when your owned tokens move, including their new grid coordinate.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceTokenCreateDelete', {
        name: 'Announce Tokens Entering/Leaving Scene',
        hint: 'Screen reader announces when tokens are added to or removed from the current scene.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceHpChanges', {
        name: 'Announce HP / Damage Changes',
        hint: 'Screen reader announces detailed HP changes for owned actors and damage or healing for currently targeted visible tokens without revealing their HP totals.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('foundry-navigator', 'announceConditions', {
        name: 'Announce Status Effects / Conditions',
        hint: 'Screen reader announces when conditions or active effects are applied to or removed from owned actors.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.keybindings.register('foundry-navigator', 'whereAmI', {
        name: 'Where Am I - Read Position & Status',
        hint: "Announces the controlled token's grid position, HP, and active conditions via the screen reader.",
        editable: [{ key: 'KeyW', modifiers: ['Alt', 'Shift'] }],
        onDown: () =>
        {
            const token = canvas?.tokens?.controlled?.[0];
            if (!token)
            {
                announceAssertive("No token controlled.");
                return true;
            }
            const parts = [token.name ?? "Token"];
            const pos = getGridLabel(token);
            if (pos) parts.push(pos);
            const hp = getHPString(token);
            if (hp) parts.push(hp);
            const cond = getConditionsString(token);
            if (cond) parts.push(`Conditions: ${cond}`);
            announceAssertive(parts.join(" \u2014 "));
            return true;
        },
    });

    game.keybindings.register('foundry-navigator', 'readLastRollResult', {
        name: 'Read Last Roll Result',
        hint: 'Announces the most recent roll result from chat. Alt+1 through Alt+9 read recent roll history directly.',
        editable: [{ key: 'KeyR', modifiers: ['Alt', 'Shift'] }],
        onDown: () =>
        {
            return readRollHistoryEntry(0);
        },
    });

    for (let index = 1; index <= 9; index++)
    {
        game.keybindings.register('foundry-navigator', `readRollHistory${index}`, {
            name: `Read Roll History ${index}`,
            hint: index === 1
                ? 'Announces the most recent structured roll result from chat.'
                : `Announces roll result ${index} from recent chat roll history.`,
            editable: [{ key: `Digit${index}`, modifiers: ['Alt'] }],
            onDown: () => readRollHistoryEntry(index - 1),
        });
    }

    game.keybindings.register('foundry-navigator', 'openNavigatorSettings', {
        name: 'Open Foundry Navigator Settings',
        hint: 'Opens Configure Settings and focuses the Foundry Navigator settings tab.',
        editable: [{ key: 'KeyA', modifiers: ['Alt', 'Shift'] }],
        onDown: () =>
        {
            void openNavigatorSettings();
            return true;
        },
    });

    game.keybindings.register('foundry-navigator', 'openConfigureControls', {
        name: 'Open Configure Controls',
        hint: 'Opens Foundry Configure Controls. Default: Alt+Shift+K. In binding capture fields, use Alt+Backspace to cancel. You can change this in Configure Controls.',
        editable: [{ key: 'KeyK', modifiers: ['Alt', 'Shift'] }],
        onDown: () =>
        {
            void openConfigureControls();
            return true;
        },
    });

    game.keybindings.register('foundry-navigator', 'toggleGamePause', {
        name: 'Toggle Game Pause',
        hint: "Pauses or unpauses the game without using Foundry's Space shortcut. Default: Alt+Shift+P. Only GMs can pause or unpause the game.",
        editable: [{ key: 'KeyP', modifiers: ['Alt', 'Shift'] }],
        onDown: () =>
        {
            void toggleGamePause();
            return true;
        },
    });

    game.keybindings.register('foundry-navigator', 'openMyCharacterSheet', {
        name: 'Open My Character Sheet',
        hint: "Opens your current character sheet using your controlled token first, then your assigned character. Default: Alt+C. This also provides a fallback when Foundry's core C shortcut cannot resolve a character. You can change this in Configure Controls.",
        editable: [{ key: 'KeyC', modifiers: ['Alt'] }],
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: () =>
        {
            void openPreferredCharacterSheet();
            return true;
        },
    });
});

// ---------------------------------------------------------------------------
// Create ARIA live regions once the UI is ready
// ---------------------------------------------------------------------------

Hooks.on("ready", () =>
{
    void migrateLegacyDefaultKeybindings().catch(error =>
    {
        console.warn("Foundry Navigator could not migrate legacy keybinding defaults.", error);
    });
    focusCanvasAfterReady();

    const handleKeybindingsControlsKeyEvent = (event) =>
    {
        const root = getKeybindingsConfigRoot();
        if (!(root instanceof HTMLElement)) return;

        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement) || !root.contains(activeElement)) return;

        if (event.type === "keydown" && isSaveKeybindingsShortcut(event))
        {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            saveKeybindingsConfig(root);
            return;
        }

        const inBindingControls = !!activeElement.closest('.form-group[data-action-id] .form-fields, .form-group[data-action-id] li[data-binding-id]');
        if (!inBindingControls) return;

        if (event.key === "Tab" && event.type === "keydown")
        {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            focusNearestKeybindingControl(activeElement, { forward: !event.shiftKey });
            return;
        }

        const isCancelChord =
            (event.key === "Escape" && event.altKey)
            || (event.key === "Backspace" && event.altKey);

        if (isCancelChord)
        {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();

            if (event.type !== "keydown") return;

            const currentGroup = activeElement.closest('.form-group[data-action-id]');
            const fallbackControl = currentGroup?.querySelector?.([
                '.form-fields button:not([disabled])',
                '.form-fields [tabindex]:not([tabindex="-1"])',
                '.form-fields input:not([type="hidden"]):not([disabled])',
            ].join(', '));

            if (isKeybindingCaptureInput(activeElement))
            {
                activeElement.value = "";
                activeElement.dispatchEvent(new Event("input", { bubbles: true }));
                activeElement.dispatchEvent(new Event("change", { bubbles: true }));
            }

            activeElement.blur();

            requestAnimationFrame(() =>
            {
                if (fallbackControl instanceof HTMLElement) fallbackControl.focus({ preventScroll: false });
                else focusNearestKeybindingControl(activeElement, { forward: true });
            });
        }
    };

    if (!document.getElementById("fn-aria-live-polite"))
    {
        const polite = document.createElement("div");
        polite.id = "fn-aria-live-polite";
        polite.setAttribute("role", "status");
        polite.setAttribute("aria-live", "polite");
        polite.setAttribute("aria-atomic", "true");
        polite.setAttribute("aria-relevant", "additions text");
        polite.className = "fn-sr-only";
        document.body.appendChild(polite);
    }

    if (!document.getElementById("fn-aria-live-assertive"))
    {
        const assertive = document.createElement("div");
        assertive.id = "fn-aria-live-assertive";
        assertive.setAttribute("role", "alert");
        assertive.setAttribute("aria-live", "assertive");
        assertive.setAttribute("aria-atomic", "true");
        assertive.setAttribute("aria-relevant", "additions text");
        assertive.className = "fn-sr-only";
        document.body.appendChild(assertive);
    }

    document.addEventListener("keydown", handleKeybindingsControlsKeyEvent, true);
    document.addEventListener("keyup", handleKeybindingsControlsKeyEvent, true);
});

async function migrateLegacyDefaultKeybindings()
{
    const replacements = [
        {
            action: "foundry-navigator.whereAmI",
            legacy: [[{ key: "KeyW", modifiers: [] }]],
            replacement: [{ key: "KeyW", modifiers: ["Alt", "Shift"] }],
        },
        {
            action: "foundry-navigator.readLastRollResult",
            legacy: [[{ key: "KeyR", modifiers: ["Alt"] }]],
            replacement: [{ key: "KeyR", modifiers: ["Alt", "Shift"] }],
        },
        {
            action: "foundry-navigator.focusCharacterSheetTabs",
            legacy: [[{ key: "KeyT", modifiers: ["Alt"] }]],
            replacement: [{ key: "KeyH", modifiers: ["Alt", "Shift"] }],
        },
        {
            action: "foundry-navigator.openMyCharacterSheet",
            legacy: [
                [{ key: "KeyC", modifiers: [] }],
                [{ key: "KeyC", modifiers: ["Alt", "Shift"] }],
            ],
            replacement: [{ key: "KeyC", modifiers: ["Alt"] }],
        },
    ];

    const storedBindings = foundry.utils.deepClone(game.settings.get("core", "keybindings"));
    let changed = false;

    for (const { action, legacy, replacement } of replacements)
    {
        const current = storedBindings[action];
        if (!legacy.some(binding => keybindingListsMatch(current, binding))) continue;
        storedBindings[action] = replacement;
        changed = true;
    }

    if (!changed) return;

    await game.settings.set("core", "keybindings", storedBindings);
    game.keybindings.initialize();
}

function keybindingListsMatch(left, right)
{
    if (!Array.isArray(left) || left.length !== right.length) return false;

    return left.every((binding, index) =>
    {
        const expected = right[index];
        const modifiers = [...(binding?.modifiers ?? [])].sort();
        const expectedModifiers = [...(expected?.modifiers ?? [])].sort();
        return binding?.key === expected?.key
            && modifiers.length === expectedModifiers.length
            && modifiers.every((modifier, modifierIndex) => modifier === expectedModifiers[modifierIndex]);
    });
}

Hooks.on("renderSettingsConfig", () =>
{
    const moduleId = "foundry-navigator";

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(() =>
        {
            enhanceNavigatorSettingsPanel(moduleId);
        });
    });
});

// ---------------------------------------------------------------------------
// Announcement helpers
// ---------------------------------------------------------------------------

/**
 * Announce a message politely; the screen reader will finish the current
 * sentence before reading this out.
 * @param {string} message
 */
function announcePolite(message)
{
    const region = document.getElementById("fn-aria-live-polite");
    if (!region) return;
    // Clear first, then set; forces re-announcement even of identical strings
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = message; });
}

/**
 * Announce a message assertively; the screen reader interrupts its current
 * speech to read this immediately.  Use sparingly.
 * @param {string} message
 */
function announceAssertive(message)
{
    const region = document.getElementById("fn-aria-live-assertive");
    if (!region) return;
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = message; });
}

// Expose so other scripts or macros can piggyback on these regions.
globalThis.FoundryNavigatorAnnounce = {
    polite: announcePolite,
    assertive: announceAssertive,
    testPolite: (message = "Foundry Navigator polite announcement test.") => announcePolite(message),
    testAssertive: (message = "Foundry Navigator assertive announcement test.") => announceAssertive(message),
};

const FN_ANNOUNCED_ROLL_MESSAGES = new Map();
const FN_ROLL_HISTORY = [];
const FN_PREUPDATE_HP = new Map();
const FN_CONDITION_ANNOUNCEMENT_CACHE = new Map();
const FN_SETTINGS_ANNOUNCEMENT_CACHE = new Map();

function getRenderedApplicationRoot(html)
{
    return html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
}

function stripHtmlToText(html)
{
    if (!html) return "";
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    return tempDiv.textContent?.trim() || "";
}

function normalizeAnnouncementText(text)
{
    return text?.replace(/\s+/g, " ").trim() || "";
}

function getSpeakerName(message)
{
    return message.speaker?.alias || message.author?.name || game.i18n.localize("Unknown");
}

async function toggleGamePause()
{
    if (!game.user?.isGM)
    {
        announceAssertive("Only the GM can pause or unpause the game.");
        return false;
    }

    if (typeof game.togglePause !== "function")
    {
        announceAssertive("Could not toggle game pause.");
        return false;
    }

    const shouldPause = !game.paused;
    await game.togglePause(shouldPause, true);
    announceAssertive(shouldPause ? "Game paused." : "Game unpaused.");
    return true;
}

function getModuleSettingsTabButton(moduleId)
{
    const selectors = [
        `.settings-sidebar button[data-tab="${moduleId}"]`,
        `.tabs button[data-tab="${moduleId}"]`,
        `[data-application-part="sidebar"] button[data-tab="${moduleId}"]`,
    ];

    for (const selector of selectors)
    {
        const button = document.querySelector(selector);
        if (button instanceof HTMLElement) return button;
    }

    return null;
}

function getKeybindingsConfigRoot()
{
    return document.querySelector('.keybindings-config, [data-application-class*="KeybindingsConfig"]');
}

function isSaveKeybindingsShortcut(event)
{
    return event.key?.toLowerCase?.() === "s"
        && event.ctrlKey
        && !event.altKey
        && !event.metaKey;
}

function isKeybindingCaptureInput(element)
{
    return element instanceof HTMLInputElement
        && element.type === "text"
        && /\.binding\.\d+$/.test(element.name ?? "");
}

function getKeybindingsSaveButton(root = getKeybindingsConfigRoot())
{
    if (!(root instanceof HTMLElement)) return null;

    const selectors = [
        'button[type="submit"]:not([disabled])',
        'button[data-action="save"]:not([disabled])',
        'button[data-action="submit"]:not([disabled])',
        'button[name="submit"]:not([disabled])',
        'footer button:not([disabled])',
        '.form-footer button:not([disabled])',
        '.window-content button:not([disabled])',
    ];

    const buttons = [...root.querySelectorAll(selectors.join(', '))]
        .filter(button => button instanceof HTMLButtonElement);

    return buttons.find(button => /save|submit|apply/i.test(button.textContent ?? button.getAttribute("aria-label") ?? ""))
        ?? buttons.find(button => button.type === "submit")
        ?? null;
}

function saveKeybindingsConfig(root = getKeybindingsConfigRoot())
{
    const saveButton = getKeybindingsSaveButton(root);
    if (saveButton)
    {
        saveButton.click();
        announceAssertive("Configure Controls saved.");
        return true;
    }

    const form = root?.querySelector?.("form");
    if (form instanceof HTMLFormElement)
    {
        form.requestSubmit();
        announceAssertive("Configure Controls saved.");
        return true;
    }

    announceAssertive("Could not find the Configure Controls save button.");
    return false;
}

function getKeybindingControls(root = getKeybindingsConfigRoot())
{
    if (!(root instanceof HTMLElement)) return [];

    const selectors = [
        '.form-group[data-action-id] .form-fields button:not([disabled])',
        '.form-group[data-action-id] .form-fields input:not([type="hidden"]):not([disabled])',
        '.form-group[data-action-id] .form-fields [tabindex]:not([tabindex="-1"])',
        '.form-group[data-action-id] li[data-binding-id] button:not([disabled])',
        '.form-group[data-action-id] li[data-binding-id] input:not([type="hidden"]):not([disabled])',
        '.form-group[data-action-id] li[data-binding-id] [tabindex]:not([tabindex="-1"])',
    ];

    return [...root.querySelectorAll(selectors.join(', '))]
        .filter((element) =>
            element instanceof HTMLElement
            && !element.hidden
            && !element.closest('[hidden], [inert], .hidden')
            && getComputedStyle(element).display !== 'none'
            && getComputedStyle(element).visibility !== 'hidden'
            && getComputedStyle(element).visibility !== 'collapse'
        );
}

function focusNearestKeybindingControl(fromElement, { forward = true } = {})
{
    const controls = getKeybindingControls();
    if (!controls.length) return false;

    const currentIndex = controls.findIndex((control) => control === fromElement);
    const fallbackIndex = forward ? 0 : controls.length - 1;
    const nextIndex = currentIndex === -1
        ? fallbackIndex
        : (currentIndex + (forward ? 1 : -1) + controls.length) % controls.length;

    const target = controls[nextIndex];
    if (!(target instanceof HTMLElement)) return false;

    target.focus({ preventScroll: false });
    return true;
}

function isChatInputElement(element)
{
    if (!(element instanceof HTMLElement)) return false;

    return !!element.closest("#chat-form, #chat, .chat-sidebar")
        && element.matches("input, textarea, [contenteditable='true']");
}
function shouldMoveInitialFocus(element)
{
    if (!(element instanceof HTMLElement)) return true;
    if (element === document.body || element === document.documentElement) return true;
    return isChatInputElement(element);
}

function getCanvasFocusTarget()
{
    const candidates = [
        canvas?.app?.view,
        document.querySelector("#board canvas"),
        document.querySelector("canvas"),
        document.getElementById("board"),
        document.getElementById("canvas"),
    ];

    return candidates.find(candidate => candidate instanceof HTMLElement) ?? document.body;
}

function focusCanvasAfterReady(tries = 10)
{
    const attemptFocus = () =>
    {
        const activeElement = document.activeElement;
        if (!shouldMoveInitialFocus(activeElement)) return;

        const target = getCanvasFocusTarget();
        if (!(target instanceof HTMLElement))
        {
            if (--tries > 0) setTimeout(attemptFocus, 100);
            return;
        }

        if (!target.hasAttribute("tabindex") && !target.matches("button, input, select, textarea, a[href]"))
        {
            target.tabIndex = -1;
        }

        target.focus({ preventScroll: true });
    };

    for (let index = 1; index <= tries; index += 1)
    {
        setTimeout(attemptFocus, 250 * index);
    }
}

function getPreferredCharacterActor()
{
    const controlledActor = canvas?.tokens?.controlled?.[0]?.actor;
    if (controlledActor?.isOwner) return controlledActor;

    if (game.user?.character?.isOwner) return game.user.character;

    const ownedSceneTokens = canvas?.tokens?.placeables?.filter((token) => token.actor?.isOwner) ?? [];
    if (ownedSceneTokens.length === 1) return ownedSceneTokens[0].actor;

    return null;
}

async function openPreferredCharacterSheet()
{
    const actor = getPreferredCharacterActor();
    if (!actor)
    {
        announceAssertive("No owned character sheet is available to open.");
        return;
    }

    await actor.sheet.render(true, { focus: true });

    const root = actor.sheet?.element instanceof HTMLElement
        ? actor.sheet.element
        : actor.sheet?.element?.[0] instanceof HTMLElement
            ? actor.sheet.element[0]
            : null;

    root?.focus?.({ preventScroll: false });
    announcePolite(`Opened character sheet for ${actor.name}.`);
}

function isOwnedActor(actor)
{
    return !!actor?.isOwner;
}

function hasHpChange(changes)
{
    if (!changes) return false;
    if (foundry.utils.hasProperty(changes, "system.attributes.hp")) return true;

    const flattened = foundry.utils.flattenObject(changes);
    return Object.keys(flattened).some(key => key.startsWith("system.attributes.hp."));
}

function getHpData(actor)
{
    const hp = actor?.system?.attributes?.hp;
    if (!hp) return null;

    return {
        value: Number(hp.value ?? 0),
        max: Number(hp.max ?? 0),
        temp: Number(hp.temp ?? 0),
        tempmax: Number(hp.tempmax ?? 0),
    };
}

function formatCurrentHp(actor)
{
    const hp = getHpData(actor);
    if (!hp || !hp.max) return null;

    const parts = [`HP ${hp.value} of ${hp.max}`];
    if (hp.temp > 0) parts.push(`${hp.temp} temporary HP`);
    return parts.join(". ");
}

function getHpChangeAnnouncement(actor, previousHp, currentHp, options = {})
{
    if (!previousHp || !currentHp) return null;

    const {
        name = actor?.name ?? "Actor",
        includeCurrentTotal = true,
        includeTemporaryHp = true,
    } = options;
    const hpSummary = formatCurrentHp(actor);
    const announcements = [];

    const hpDelta = currentHp.value - previousHp.value;
    if (hpDelta < 0)
    {
        announcements.push(`${name} takes ${Math.abs(hpDelta)} damage.`);
    } else if (hpDelta > 0)
    {
        announcements.push(`${name} regains ${hpDelta} hit points.`);
    }

    const tempDelta = currentHp.temp - previousHp.temp;
    if (includeTemporaryHp && tempDelta < 0)
    {
        announcements.push(`${name} loses ${Math.abs(tempDelta)} temporary hit points.`);
    } else if (includeTemporaryHp && tempDelta > 0)
    {
        announcements.push(`${name} gains ${tempDelta} temporary hit points.`);
    }

    if (!announcements.length) return null;
    if (includeCurrentTotal && hpSummary) announcements.push(`${hpSummary}.`);

    return announcements.join(" ");
}

function getTargetedTokenForActor(actor, targets = game.user?.targets, user = game.user)
{
    if (!actor || !targets) return null;

    for (const token of targets)
    {
        if (!token) continue;
        if (token.document?.hidden && !user?.isGM) continue;

        const sameActor = token.actor === actor;
        const sameSyntheticToken = actor.token?.id && token.document?.id === actor.token.id;
        if (sameActor || sameSyntheticToken) return token;
    }

    return null;
}

function getHpAnnouncementContext(actor, targets = game.user?.targets, user = game.user)
{
    if (isOwnedActor(actor))
    {
        return {
            name: actor?.name ?? "Actor",
            includeCurrentTotal: true,
            includeTemporaryHp: true,
        };
    }

    const target = getTargetedTokenForActor(actor, targets, user);
    if (!target) return null;

    return {
        name: target.name ?? target.document?.name ?? actor?.name ?? "Target",
        includeCurrentTotal: false,
        includeTemporaryHp: false,
    };
}

globalThis.FoundryNavigatorHp = {
    getHpAnnouncementContext,
    getHpChangeAnnouncement,
};

function getConditionLabel(document)
{
    if (!document) return "";

    return document.name
        || document.label
        || document.getFlag?.("core", "statusId")
        || "";
}

function isConditionLikeDocument(document)
{
    if (!document) return false;

    if (document.documentName === "ActiveEffect") return true;
    if (document.documentName === "Item" && document.type === "condition") return true;

    return false;
}

function shouldAnnounceConditionEvent(key)
{
    const now = Date.now();
    const previous = FN_CONDITION_ANNOUNCEMENT_CACHE.get(key);
    if (previous && (now - previous) < 500) return false;

    FN_CONDITION_ANNOUNCEMENT_CACHE.set(key, now);
    if (FN_CONDITION_ANNOUNCEMENT_CACHE.size > 200)
    {
        const oldestKey = FN_CONDITION_ANNOUNCEMENT_CACHE.keys().next().value;
        if (oldestKey) FN_CONDITION_ANNOUNCEMENT_CACHE.delete(oldestKey);
    }

    return true;
}

function announceConditionChange(document, action)
{
    if (!game.settings.get('foundry-navigator', 'announceConditions')) return;
    if (!isConditionLikeDocument(document)) return;

    const actor = document.parent?.documentName === "Actor" ? document.parent : null;
    if (!isOwnedActor(actor)) return;

    const conditionName = getConditionLabel(document);
    if (!conditionName) return;

    const cacheKey = `${action}:${actor.id}:${conditionName}`;
    if (!shouldAnnounceConditionEvent(cacheKey)) return;

    announcePolite(`${conditionName} ${action} ${actor.name}.`);
}

function getChatMessageAnnouncement(message)
{
    const speaker = getSpeakerName(message);
    const content = normalizeAnnouncementText(stripHtmlToText(message.content ?? ""));
    if (!content) return null;
    return `${speaker}: ${content}`;
}

function getUniqueNormalizedTexts(elements, options = {})
{
    const {
        minLength = 1,
        excludedTexts = [],
    } = options;

    const excluded = new Set(excludedTexts.map(text => normalizeAnnouncementText(text).toLowerCase()));
    const results = [];

    for (const element of elements ?? [])
    {
        if (!(element instanceof HTMLElement)) continue;
        const text = normalizeAnnouncementText(element.textContent);
        if (!text || text.length < minLength) continue;
        if (excluded.has(text.toLowerCase())) continue;
        if (!results.includes(text)) results.push(text);
    }

    return results;
}

function getChatCardTargets(root)
{
    if (!(root instanceof HTMLElement)) return [];

    const rows = root.querySelectorAll([
        ".card-tray.targets-tray .target",
        ".targets .target",
        ".targets li",
        "damage-application .targets .target",
        "damage-application .targets li",
        ".damage-tray .targets .target",
        ".damage-tray .targets li",
        ".targeted .target",
        ".targeted li",
        "[data-application-part='targets'] .target",
        "[data-application-part='targets'] li",
        ".damage-application .target",
        ".damage-application li",
    ].join(", "));

    const targets = [];

    for (const row of rows)
    {
        if (!(row instanceof HTMLElement)) continue;

        const namedElements = row.querySelectorAll(".name, .name-stacked, .name-stacked .title, .target-name, .actor-name, .token-name, strong, .label, .title");
        const names = getUniqueNormalizedTexts(namedElements, {
            minLength: 2,
            excludedTexts: ["targets", "targeted", "selected", "apply"],
        });

        if (names.length)
        {
            for (const name of names)
            {
                if (!targets.includes(name)) targets.push(name);
            }
            continue;
        }

        const rowText = normalizeAnnouncementText(row.textContent);
        if (!rowText) continue;
        if (/^(targets|targeted|selected|apply)$/i.test(rowText)) continue;
        if (/^-?\d+$/.test(rowText)) continue;
        if (!targets.includes(rowText)) targets.push(rowText);
    }

    return targets;
}

function getAppliedDamageApplications(root)
{
    if (!(root instanceof HTMLElement)) return [];

    const rows = root.querySelectorAll([
        "damage-application .targets .target",
        "damage-application .targets li",
        ".damage-tray .targets .target",
        ".damage-tray .targets li",
        ".targets .target",
        ".targets li",
        ".damage-application .target",
        ".damage-application li",
        "[data-application-part='targets'] .target",
        "[data-application-part='targets'] li",
    ].join(", "));

    const results = [];

    for (const row of rows)
    {
        if (!(row instanceof HTMLElement)) continue;

        const name = getUniqueNormalizedTexts(
            row.querySelectorAll(".name, .name-stacked, .name-stacked .title, .target-name, .actor-name, .token-name, strong, .label, .title"),
            {
                minLength: 2,
                excludedTexts: ["targets", "targeted", "selected", "apply"],
            }
        )[0];

        const valueElement = row.querySelector(".value, .damage, .delta, .change");
        const valueText = normalizeAnnouncementText(valueElement?.textContent ?? row.textContent ?? "");
        const signedMatch = valueText.match(/-\d+/);
        const numericMatch = signedMatch ?? valueText.match(/\b\d+\b/);
        if (!name || !numericMatch) continue;

        const amount = Math.abs(Number(numericMatch[0]));
        if (!Number.isFinite(amount)) continue;

        results.push({ target: name, amount });
    }

    return results;
}

function getAppliedDamageSummary(root)
{
    const applications = getAppliedDamageApplications(root);
    if (!applications.length) return null;
    return applications
        .map(application => `${application.target} ${application.amount} damage`)
        .join(", ");
}

function getMessageRoot(message, root = null)
{
    if (root instanceof HTMLElement) return root;

    const content = message?.content ?? "";
    if (typeof content !== "string" || !content) return null;

    const container = document.createElement("div");
    container.innerHTML = content;
    return container;
}

function getRollTotals(message, root = null)
{
    const totals = [
        ...new Set(
            [
                ...root?.querySelectorAll?.(".dice-total") ?? [],
            ]
                .map(element => normalizeAnnouncementText(element.textContent))
                .filter(Boolean)
        ),
    ];

    if (!totals.length && Array.isArray(message?.rolls))
    {
        for (const roll of message.rolls)
        {
            const total = roll?.total;
            if (total === undefined || total === null) continue;
            totals.push(String(total));
        }
    }

    return totals;
}

function getRollFormula(message, root = null)
{
    const formula = normalizeAnnouncementText(root?.querySelector(".dice-formula")?.textContent ?? "");
    if (formula) return formula;

    const roll = Array.isArray(message?.rolls) ? message.rolls[0] : null;
    return normalizeAnnouncementText(roll?.formula ?? "");
}

function cleanRollItemName(flavor)
{
    const text = normalizeAnnouncementText(flavor);
    if (!text) return "";

    const split = text.split(/\s+(?:Melee|Ranged|Spell|Weapon|Attack|Damage|Healing|Save|Check|Roll)\b/i)[0]?.trim();
    return split || text;
}

function getRollKind(flavor)
{
    if (/damage/i.test(flavor)) return "damage";
    if (/healing|heal/i.test(flavor)) return "healing";
    if (/attack/i.test(flavor)) return "attack";
    if (/save/i.test(flavor)) return "save";
    if (/check|skill|ability/i.test(flavor)) return "check";
    return "roll";
}

function getRollEntryFromMessage(message, root = null)
{
    if (!message) return null;
    if (message.visible === false || message.isContentVisible === false) return null;

    const messageRoot = getMessageRoot(message, root);
    const totals = getRollTotals(message, messageRoot);
    if (!totals.length) return null;

    const flavor = normalizeAnnouncementText(
        messageRoot?.querySelector(".dice-flavor")?.textContent
        || message.flavor
        || ""
    );
    const damageApplications = getAppliedDamageApplications(messageRoot);

    return {
        id: message.id ?? message.uuid ?? `${message.timestamp ?? Date.now()}`,
        timestamp: Number(message.timestamp ?? Date.now()),
        speaker: getSpeakerName(message),
        flavor,
        item: cleanRollItemName(flavor),
        kind: getRollKind(flavor),
        formula: getRollFormula(message, messageRoot),
        totals,
        targets: getChatCardTargets(messageRoot),
        damageApplications,
    };
}

function canMergeDamageIntoAttack(attackEntry, damageEntry)
{
    if (!attackEntry || !damageEntry) return false;
    if (attackEntry.kind !== "attack" || damageEntry.kind !== "damage") return false;
    if (attackEntry.speaker !== damageEntry.speaker) return false;
    if (attackEntry.damageApplications?.length) return false;
    if (!damageEntry.damageApplications?.length) return false;

    const attackItem = attackEntry.item || attackEntry.flavor;
    const damageItem = damageEntry.item || damageEntry.flavor;
    return !attackItem || !damageItem || attackItem === damageItem;
}

function rebuildRollHistory()
{
    FN_ROLL_HISTORY.length = 0;
    const messages = game.messages?.contents;
    if (!Array.isArray(messages)) return FN_ROLL_HISTORY;

    const sortedMessages = [...messages].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
    for (const message of sortedMessages)
    {
        const entry = getRollEntryFromMessage(message);
        if (!entry) continue;

        const matchingAttack = [...FN_ROLL_HISTORY].reverse().find(candidate => canMergeDamageIntoAttack(candidate, entry));
        if (matchingAttack)
        {
            matchingAttack.damageApplications = entry.damageApplications;
            matchingAttack.damageTotal = entry.totals[0] ?? null;
            matchingAttack.damageFormula = entry.formula;
            matchingAttack.timestamp = Math.max(matchingAttack.timestamp, entry.timestamp);
            matchingAttack.targets = matchingAttack.targets.length ? matchingAttack.targets : entry.damageApplications.map(application => application.target);
            continue;
        }

        FN_ROLL_HISTORY.push(entry);
    }

    FN_ROLL_HISTORY.sort((a, b) => b.timestamp - a.timestamp);
    FN_ROLL_HISTORY.splice(9);
    return FN_ROLL_HISTORY;
}

function formatDamageApplications(applications)
{
    if (!applications?.length) return "";
    return applications
        .map(application => `${application.target} took ${application.amount} damage`)
        .join(", ");
}

function getStructuredRollNarration(entry, index = 0)
{
    if (!entry) return null;

    const prefix = index === 0 ? "Most recent roll" : `Roll ${index + 1}`;
    const total = entry.totals?.[0] ?? null;
    const target = entry.damageApplications?.[0]?.target ?? entry.targets?.[0] ?? "";
    const item = entry.item || entry.flavor;
    const damageText = formatDamageApplications(entry.damageApplications);

    if (entry.kind === "attack" && damageText)
    {
        let announcement = `${prefix}: ${entry.speaker} attacked`;
        if (target) announcement += ` ${target}`;
        if (item) announcement += ` with ${item}`;
        announcement += ".";
        if (total) announcement += ` Rolled ${total}.`;
        announcement += ` ${damageText}.`;
        return announcement;
    }

    if (entry.kind === "attack")
    {
        let announcement = `${prefix}: ${entry.speaker} attacked`;
        if (target) announcement += ` ${target}`;
        if (item) announcement += ` with ${item}`;
        if (total) announcement += `. Rolled ${total}.`;
        else announcement += ".";
        return announcement;
    }

    if (entry.kind === "damage" && damageText)
    {
        const parts = [`${prefix}: ${entry.speaker} rolled damage`];
        if (item) parts.push(`with ${item}`);
        if (total) parts.push(`for ${total}`);
        parts.push(`${damageText}.`);
        return parts.join(" ").replace(/\s+\./g, ".");
    }

    const parts = [`${prefix}: ${entry.speaker}`];
    if (entry.flavor) parts.push(entry.flavor);
    if (total) parts.push(`Total ${total}.`);
    return parts.join(". ").replace(/\.\s+\./g, ". ");
}

function readRollHistoryEntry(index)
{
    const history = rebuildRollHistory();
    const entry = history[index];
    if (!entry)
    {
        announceAssertive(index === 0 ? "No recent roll result found in chat." : `No roll result ${index + 1} found in recent chat history.`);
        return true;
    }

    const announcement = getStructuredRollNarration(entry, index);
    if (!announcement)
    {
        announceAssertive("Could not read that roll result.");
        return true;
    }

    announceAssertive(announcement);
    return true;
}

function getRollAnnouncement(message, root)
{
    const speaker = getSpeakerName(message);
    const flavor = normalizeAnnouncementText(
        root?.querySelector(".dice-flavor")?.textContent
        || message.flavor
        || ""
    );

    const totals = getRollTotals(message, root);

    if (!totals.length) return null;

    const parts = [speaker];
    if (flavor) parts.push(flavor);

    if (totals.length === 1)
    {
        parts.push(`Total ${totals[0]}.`);
    } else
    {
        parts.push(`Totals ${totals.join(", ")}.`);
    }

    const targets = getChatCardTargets(root);
    if (targets.length) parts.push(`Targets ${targets.join(", ")}.`);

    const appliedDamage = getAppliedDamageSummary(root);
    if (appliedDamage) parts.push(`Applied ${appliedDamage}.`);

    return parts.join(". ").replace(/\.\s+\./g, ". ");
}

function getLatestRollMessage()
{
    const messages = game.messages?.contents;
    if (!Array.isArray(messages)) return null;

    return [...messages].reverse().find(message =>
    {
        if (message?.isRoll || message?.rolls?.length) return true;

        const content = message?.content ?? "";
        return typeof content === "string" && /dice-total|dice-roll|dice-result/.test(content);
    }) ?? null;
}

globalThis.FoundryNavigatorRollHistory = {
    rebuildRollHistory,
    getRollEntryFromMessage,
    getStructuredRollNarration,
};

function getNavigatorSettingsPanel(moduleId)
{
    const selectors = [
        `.tab[data-tab="${moduleId}"]`,
        `.settings-panel[data-tab="${moduleId}"]`,
        `[data-application-part="tab"][data-tab="${moduleId}"]`,
    ];

    for (const selector of selectors)
    {
        const panel = document.querySelector(selector);
        if (panel instanceof HTMLElement) return panel;
    }

    return null;
}

function focusFirstNavigatorSetting(moduleId)
{
    const panel = getNavigatorSettingsPanel(moduleId);
    if (!(panel instanceof HTMLElement)) return false;

    const focusSelector = [
        "input:not([type='hidden']):not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "button:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
    ].join(", ");

    const firstControl = [...panel.querySelectorAll(focusSelector)]
        .find(element => element instanceof HTMLElement && !element.hidden && !element.closest("[hidden], [inert], .hidden"));

    if (!(firstControl instanceof HTMLElement)) return false;

    firstControl.focus({ preventScroll: false });
    return true;
}

async function openNavigatorSettings()
{
    const moduleId = "foundry-navigator";
    const moduleTitle = game.modules.get(moduleId)?.title ?? "Foundry Navigator";
    const SettingsConfigClass = foundry?.applications?.settings?.SettingsConfig ?? globalThis.SettingsConfig;

    if (!SettingsConfigClass)
    {
        ui.notifications?.warn?.("Could not open Configure Settings.");
        announceAssertive("Could not open Configure Settings.");
        return false;
    }

    const existingApp = Object.values(ui.windows ?? {}).find(app => app instanceof SettingsConfigClass);
    const app = existingApp ?? new SettingsConfigClass();
    app.render(true);

    let tries = 20;
    const focusModuleTab = () =>
    {
        const tabButton = document.querySelector(`.settings-sidebar button[data-tab="${moduleId}"], .tabs button[data-tab="${moduleId}"]`);
        if (tabButton instanceof HTMLElement)
        {
            tabButton.click();
            requestAnimationFrame(() =>
            {
                requestAnimationFrame(() =>
                {
                    const focusedControl = focusFirstNavigatorSetting(moduleId);
                    if (!focusedControl) tabButton.focus({ preventScroll: false });
                    announceAssertive(
                        focusedControl
                            ? `${moduleTitle} settings opened. Focus moved to the first setting.`
                            : `${moduleTitle} settings opened.`
                    );
                });
            });
            return;
        }

        const searchInput = document.querySelector('.settings-sidebar input[type="search"], .window-content input[type="search"]');
        if (searchInput instanceof HTMLInputElement)
        {
            searchInput.focus({ preventScroll: false });
            searchInput.value = moduleTitle;
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            announceAssertive(`Configure Settings opened. Search set to ${moduleTitle}.`);
            return;
        }

        if (--tries > 0) setTimeout(focusModuleTab, 100);
        else announceAssertive("Configure Settings opened.");
    };

    setTimeout(focusModuleTab, 250);
    return true;
}

function getSettingGroupLabel(group)
{
    if (!(group instanceof HTMLElement)) return "";

    const label = group.querySelector("label, .form-header, h3, h4");
    return normalizeAnnouncementText(label?.textContent ?? "");
}

function getSettingGroupHint(group)
{
    if (!(group instanceof HTMLElement)) return "";

    const hint = group.querySelector(".notes, .hint, p");
    return normalizeAnnouncementText(hint?.textContent ?? "");
}

function getSettingGroupValue(group)
{
    if (!(group instanceof HTMLElement)) return "";

    const checkbox = group.querySelector('input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) return checkbox.checked ? "On" : "Off";

    const select = group.querySelector("select");
    if (select instanceof HTMLSelectElement)
    {
        return normalizeAnnouncementText(select.selectedOptions?.[0]?.textContent ?? select.value ?? "");
    }

    const textInput = group.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea');
    if (textInput instanceof HTMLInputElement || textInput instanceof HTMLTextAreaElement)
    {
        return normalizeAnnouncementText(textInput.value ?? "");
    }

    return "";
}

function buildSettingAnnouncement(group)
{
    const label = getSettingGroupLabel(group);
    if (!label) return "";

    const hint = getSettingGroupHint(group);
    const value = getSettingGroupValue(group);
    const parts = [label];

    if (value) parts.push(`Current value: ${value}.`);
    if (hint) parts.push(hint);

    return parts.join(". ").replace(/\.\s+\./g, ". ");
}

function shouldAnnounceSettingsGroup(group, triggerType)
{
    const label = getSettingGroupLabel(group);
    if (!label) return false;

    const cacheKey = `${triggerType}:${label}`;
    const now = Date.now();
    const previous = FN_SETTINGS_ANNOUNCEMENT_CACHE.get(cacheKey);
    if (previous && (now - previous) < 750) return false;

    FN_SETTINGS_ANNOUNCEMENT_CACHE.set(cacheKey, now);
    if (FN_SETTINGS_ANNOUNCEMENT_CACHE.size > 100)
    {
        const oldestKey = FN_SETTINGS_ANNOUNCEMENT_CACHE.keys().next().value;
        if (oldestKey) FN_SETTINGS_ANNOUNCEMENT_CACHE.delete(oldestKey);
    }

    return true;
}

function announceSettingsGroup(group, triggerType = "focus")
{
    if (!shouldAnnounceSettingsGroup(group, triggerType)) return;

    const announcement = buildSettingAnnouncement(group);
    if (!announcement) return;

    announcePolite(announcement);
}

function enhanceNavigatorSettingsGroup(group)
{
    if (!(group instanceof HTMLElement)) return;
    if (group.dataset.fnSettingsEnhanced === "true") return;

    const label = getSettingGroupLabel(group);
    if (!label) return;

    const hint = getSettingGroupHint(group);
    const controls = group.querySelectorAll("input:not([type='hidden']), select, textarea, button");

    for (const control of controls)
    {
        if (!(control instanceof HTMLElement)) continue;

        if (!control.getAttribute("aria-label"))
        {
            const value = getSettingGroupValue(group);
            const ariaParts = [label];
            if (value) ariaParts.push(`Current value ${value}`);
            if (hint) ariaParts.push(hint);
            control.setAttribute("aria-label", ariaParts.join(". "));
        }

        control.addEventListener("focus", () => announceSettingsGroup(group, "focus"), true);
        control.addEventListener("mouseenter", () => announceSettingsGroup(group, "hover"), true);
    }

    group.addEventListener("mouseenter", () => announceSettingsGroup(group, "hover"), true);
    group.dataset.fnSettingsEnhanced = "true";
}

function enhanceNavigatorSettingsPanel(moduleId)
{
    const panel = getNavigatorSettingsPanel(moduleId);
    if (!(panel instanceof HTMLElement)) return false;

    const tabButton = getModuleSettingsTabButton(moduleId);
    if (tabButton instanceof HTMLElement && !tabButton.getAttribute("aria-label"))
    {
        const tabLabel = normalizeAnnouncementText(tabButton.textContent ?? "Foundry Navigator");
        tabButton.setAttribute("aria-label", `${tabLabel} settings`);
    }

    const groups = panel.querySelectorAll(".form-group");
    for (const group of groups)
    {
        enhanceNavigatorSettingsGroup(group);
    }

    return groups.length > 0;
}

async function openConfigureControls()
{
    const KeybindingsConfigClass = foundry?.applications?.settings?.KeybindingsConfig ?? globalThis.KeybindingsConfig;

    if (!KeybindingsConfigClass)
    {
        ui.notifications?.warn?.("Could not open Configure Controls.");
        announceAssertive("Could not open Configure Controls.");
        return false;
    }

    const existingApp = Object.values(ui.windows ?? {}).find(app => app instanceof KeybindingsConfigClass);
    const app = existingApp ?? new KeybindingsConfigClass();
    app.render(true);

    let tries = 20;
    const focusControlsWindow = () =>
    {
        const root = document.querySelector('.keybindings-config, [data-application-class*="KeybindingsConfig"], .application');

        const firstBindingControl = root?.querySelector?.([
            '.form-group[data-action-id] .form-fields button:not([disabled])',
            '.form-group[data-action-id] .form-fields input:not([type="hidden"]):not([disabled])',
            '.form-group[data-action-id] li[data-binding-id] button:not([disabled])',
            '.form-group[data-action-id] li[data-binding-id] [tabindex]:not([tabindex="-1"])',
            '.form-group[data-action-id] button:not([disabled])',
            '.form-group[data-action-id] [tabindex]:not([tabindex="-1"])',
        ].join(', '));
        if (firstBindingControl instanceof HTMLElement)
        {
            firstBindingControl.focus({ preventScroll: false });
            announceAssertive("Configure Controls opened.");
            return;
        }

        const searchInput = root?.querySelector?.('.window-content input[type="search"], input[type="search"]');
        if (searchInput instanceof HTMLElement)
        {
            searchInput.focus({ preventScroll: false });
            announceAssertive("Configure Controls opened.");
            return;
        }

        if (--tries > 0) setTimeout(focusControlsWindow, 100);
        else announceAssertive("Configure Controls opened.");
    };

    setTimeout(focusControlsWindow, 250);
    return true;
}

function shouldAnnounceRollMessage(message, announcement)
{
    if (!message?.id || !announcement) return !!announcement;

    const previousAnnouncement = FN_ANNOUNCED_ROLL_MESSAGES.get(message.id);
    if (previousAnnouncement === announcement) return false;

    FN_ANNOUNCED_ROLL_MESSAGES.set(message.id, announcement);

    if (FN_ANNOUNCED_ROLL_MESSAGES.size > 100)
    {
        const oldestKey = FN_ANNOUNCED_ROLL_MESSAGES.keys().next().value;
        if (oldestKey) FN_ANNOUNCED_ROLL_MESSAGES.delete(oldestKey);
    }

    return true;
}

function announceRollResult(message, root = null)
{
    if (!game.settings.get('foundry-navigator', 'announceRollResults')) return;

    const announcement = getRollAnnouncement(message, root);
    if (!shouldAnnounceRollMessage(message, announcement)) return;

    announcePolite(announcement);
}

// ---------------------------------------------------------------------------
// Grid coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Convert a token's canvas position to a human-readable grid label, e.g. "C3".
 * Columns are A–Z, then AA–AZ, BA–BZ, etc.  Rows are 1-based integers.
 * Returns an empty string when the grid or canvas is unavailable.
 * @param {Token} token
 * @returns {string}
 */
function getGridLabel(token)
{
    if (!canvas?.grid) return "";
    try
    {
        const { i, j } = canvas.grid.getOffset({ x: token.document.x, y: token.document.y });
        // Convert 0-based column index to spreadsheet-style letters (A, B, …, Z, AA, …)
        let col = "";
        let n = j;
        do
        {
            col = String.fromCharCode(65 + (n % 26)) + col;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return `${col}${i + 1}`;
    } catch
    {
        return "";
    }
}

/**
 * Return a formatted HP string for a token's actor, e.g. "HP 22 of 30".
 * Returns null when HP data is unavailable.
 * @param {Token} token
 * @returns {string|null}
 */
function getHPString(token)
{
    const hp = token.actor?.system?.attributes?.hp;
    if (hp == null || hp.max == null) return null;
    return `HP ${hp.value} of ${hp.max}`;
}

/**
 * Return a comma-separated list of active conditions/effects on a token.
 * Returns generic actor statuses when they are available.
 * Returns null when no conditions are found.
 * @param {Token} token
 * @returns {string|null}
 */
function getConditionsString(token)
{
    const statuses = token.actor?.statuses;
    if (statuses?.size) return [...statuses].join(", ");
    return null;
}

// Expose helpers for use in other scripts or macros.
globalThis.FoundryNavigatorGrid = { getGridLabel, getHPString, getConditionsString };

// ---------------------------------------------------------------------------
// Feature: announce incoming chat messages
// ---------------------------------------------------------------------------

Hooks.on("createChatMessage", (message) =>
{
    rebuildRollHistory();

    if (game.settings.get('foundry-navigator', 'announceRollResults') && (message.isRoll || message.rolls?.length))
    {
        announceRollResult(message);
        return;
    }

    if (!game.settings.get('foundry-navigator', 'announceChatMessages')) return;
    const announcement = getChatMessageAnnouncement(message);
    if (announcement) announcePolite(announcement);
});

Hooks.on("updateChatMessage", (message, changed) =>
{
    rebuildRollHistory();

    if (!game.settings.get('foundry-navigator', 'announceRollResults')) return;
    if (!("rolls" in changed) && !("content" in changed) && !("flavor" in changed)) return;
    if (!(message.isRoll || message.rolls?.length)) return;

    announceRollResult(message);
});

Hooks.on("renderChatMessageHTML", (message, html) =>
{
    const root = getRenderedApplicationRoot(html);
    if (!root) return;
    if (!(message.isRoll || message.rolls?.length || root.querySelector(".dice-roll, .dice-result, .dice-total"))) return;

    rebuildRollHistory();
    announceRollResult(message, root);
});

Hooks.on("preUpdateActor", (actor, changes) =>
{
    if (!game.settings.get('foundry-navigator', 'announceHpChanges')) return;
    if (!hasHpChange(changes)) return;

    const context = getHpAnnouncementContext(actor);
    if (!context) return;

    const hp = getHpData(actor);
    if (!hp) return;
    FN_PREUPDATE_HP.set(actor.uuid ?? actor.id, { hp, context });
});

Hooks.on("updateActor", (actor, changes) =>
{
    if (!game.settings.get('foundry-navigator', 'announceHpChanges')) return;
    if (!hasHpChange(changes)) return;

    const cacheKey = actor.uuid ?? actor.id;
    const previous = FN_PREUPDATE_HP.get(cacheKey);
    FN_PREUPDATE_HP.delete(cacheKey);
    if (!previous) return;

    const currentHp = getHpData(actor);
    const announcement = getHpChangeAnnouncement(actor, previous.hp, currentHp, previous.context);
    if (announcement) announcePolite(announcement);
});

Hooks.on("createActiveEffect", effect =>
{
    announceConditionChange(effect, "applied to");
});

Hooks.on("deleteActiveEffect", effect =>
{
    announceConditionChange(effect, "removed from");
});

Hooks.on("createItem", item =>
{
    announceConditionChange(item, "applied to");
});

Hooks.on("deleteItem", item =>
{
    announceConditionChange(item, "removed from");
});

// ---------------------------------------------------------------------------
// Feature: announce combat turn changes
// ---------------------------------------------------------------------------

Hooks.on("updateCombat", (combat, changed) =>
{
    if (!game.settings.get('foundry-navigator', 'announceCombatTurns')) return;

    // Only act when the active turn or round actually changed
    if (!("turn" in changed) && !("round" in changed)) return;

    const combatant = combat.combatant;
    if (!combatant) return;

    const name = combatant.name ?? game.i18n.localize("Unknown");
    let announcement = "";

    if ("round" in changed)
    {
        announcement = `Round ${combat.round} begins. ${name}'s turn.`;
    } else
    {
        announcement = `${name}'s turn.`;
    }

    announcePolite(announcement);

    // If it is now the local player's turn, use an assertive (interrupting) alert
    if (combatant.isOwner)
    {
        announceAssertive(`It is your turn, ${name}.`);
    }
});

// ---------------------------------------------------------------------------
// Feature: announce UI notifications
// ---------------------------------------------------------------------------

// Track the last count we saw so we only announce newly added notifications
let _lastNotificationCount = 0;

Hooks.on("renderNotifications", (app, html) =>
{
    if (!game.settings.get('foundry-navigator', 'announceNotifications')) return;

    // html may be HTMLElement (AppV2) or jQuery (AppV1)
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    const unannounced = root.querySelectorAll("li.notification:not([data-fn-announced])");
    for (const notification of unannounced)
    {
        notification.setAttribute("data-fn-announced", "true");
        const text = notification.textContent?.trim() || "";
        if (!text) continue;

        if (notification.classList.contains("error"))
        {
            announceAssertive(text);
        } else
        {
            announcePolite(text);
        }
    }
});

// ---------------------------------------------------------------------------
// Feature: announce token movement
// ---------------------------------------------------------------------------

Hooks.on("updateToken", (tokenDoc, changes) =>
{
    if (!game.settings.get('foundry-navigator', 'announceTokenMove')) return;
    if (!("x" in changes) && !("y" in changes)) return;

    // Only announce for tokens the local player owns
    const token = tokenDoc.object;
    if (!token?.isOwner) return;

    const name = tokenDoc.name ?? game.i18n.localize("Unknown");
    const label = getGridLabel(token);
    const message = label
        ? `${name} moves to ${label}.`
        : `${name} moves.`;
    announcePolite(message);
});

// ---------------------------------------------------------------------------
// Feature: announce tokens entering or leaving the scene
// ---------------------------------------------------------------------------

Hooks.on("createToken", (tokenDoc) =>
{
    if (!game.settings.get('foundry-navigator', 'announceTokenCreateDelete')) return;
    const name = tokenDoc.name ?? game.i18n.localize("Unknown");
    announcePolite(`${name} has entered the scene.`);
});

Hooks.on("deleteToken", (tokenDoc) =>
{
    if (!game.settings.get('foundry-navigator', 'announceTokenCreateDelete')) return;
    const name = tokenDoc.name ?? game.i18n.localize("Unknown");
    announcePolite(`${name} has left the scene.`);
});
