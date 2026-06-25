import {
    FN_MODULE_SOCKET,
    FN_SHEET_TABS_STATE,
    FN_SOCKET_ACTIONS,
    FN_SOCKET_REQUESTS,
} from "./state.js";

function getPrimaryActiveGM()
{
    const activeGMs = game.users?.filter((user) => user.active && user.isGM) ?? [];
    if (!activeGMs.length) return null;
    return activeGMs.sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

function getTargetTokenUuid(targetToken)
{
    return targetToken?.document?.uuid ?? targetToken?.uuid ?? null;
}

function canCurrentUserApplyToTarget(targetToken)
{
    const tokenDocument = targetToken?.document ?? targetToken ?? null;
    if (tokenDocument?.isOwner) return true;
    const actor = targetToken?.actor ?? tokenDocument?.actor ?? null;
    return !!actor?.isOwner;
}

async function applyRollResultToTarget(targetToken, appliedAmount, options = {})
{
    if (typeof targetToken?.applyDamage === "function")
    {
        await targetToken.applyDamage(appliedAmount, options);
        return "token";
    }

    if (typeof targetToken?.object?.applyDamage === "function")
    {
        await targetToken.object.applyDamage(appliedAmount, options);
        return "token-object";
    }

    if (typeof targetToken?.actor?.applyDamage === "function")
    {
        await targetToken.actor.applyDamage(appliedAmount, options);
        return "actor";
    }

    throw new Error("Target does not support applyDamage.");
}

function emitModuleSocket(payload)
{
    game.socket?.emit(FN_MODULE_SOCKET, payload);
}

function requestGMApplyRollResult({
    targetToken,
    appliedAmount,
    originatingMessage,
    itemName,
    targetName,
    rollType,
    isHealingRoll,
    damageTotal,
    debug,
})
{
    const activeGM = getPrimaryActiveGM();
    if (!activeGM)
    {
        return Promise.reject(new Error("No active GM is available to apply the roll result."));
    }

    const requestId = foundry.utils.randomID();
    const targetTokenUuid = getTargetTokenUuid(targetToken);
    if (!targetTokenUuid)
    {
        return Promise.reject(new Error("Target token UUID is unavailable."));
    }

    return new Promise((resolve, reject) =>
    {
        const timeoutId = window.setTimeout(() =>
        {
            FN_SOCKET_REQUESTS.delete(requestId);
            reject(new Error("Timed out waiting for GM roll application."));
        }, 10000);

        FN_SOCKET_REQUESTS.set(requestId, {
            resolve,
            reject,
            timeoutId,
        });

        debug("requested GM roll application", {
            requestId,
            targetTokenUuid,
            itemName,
            targetName,
            appliedAmount,
            gmId: activeGM.id,
        });

        emitModuleSocket({
            type: FN_SOCKET_ACTIONS.APPLY_ROLL_RESULT,
            requestId,
            requesterId: game.user.id,
            gmId: activeGM.id,
            targetTokenUuid,
            appliedAmount,
            originatingMessageId: originatingMessage?.id ?? null,
            itemName,
            targetName,
            rollType,
            isHealingRoll,
            damageTotal,
        });
    });
}

async function handleGMApplyRollResultRequest(payload, debug)
{
    debug("received GM roll application request", {
        requestId: payload?.requestId,
        requesterId: payload?.requesterId,
        gmId: payload?.gmId,
        currentUserId: game.user?.id,
        isGM: game.user?.isGM,
        targetTokenUuid: payload?.targetTokenUuid,
        itemName: payload?.itemName,
        targetName: payload?.targetName,
    });

    if (!game.user?.isGM) return;
    if (payload?.gmId && payload.gmId !== game.user.id) return;

    const targetReference = fromUuidSync(payload.targetTokenUuid);
    const originatingMessage = payload.originatingMessageId ? game.messages?.get(payload.originatingMessageId) ?? null : null;

    try
    {
        const applyPath = await applyRollResultToTarget(targetReference, payload.appliedAmount, {
            isDelta: true,
            originatingMessage,
        });

        debug("GM applied roll result for player request", {
            requestId: payload.requestId,
            itemName: payload.itemName,
            targetName: payload.targetName,
            applyPath,
        });

        emitModuleSocket({
            type: FN_SOCKET_ACTIONS.APPLY_ROLL_RESULT_RESPONSE,
            requestId: payload.requestId,
            requesterId: payload.requesterId,
            ok: true,
            itemName: payload.itemName,
            targetName: payload.targetName,
            applyPath,
        });
    }
    catch (error)
    {
        emitModuleSocket({
            type: FN_SOCKET_ACTIONS.APPLY_ROLL_RESULT_RESPONSE,
            requestId: payload.requestId,
            requesterId: payload.requesterId,
            ok: false,
            itemName: payload.itemName,
            targetName: payload.targetName,
            error: error?.message ?? String(error),
        });
    }
}

function handleApplyRollResultResponse(payload, debug)
{
    if (payload?.requesterId !== game.user.id) return;

    const pending = FN_SOCKET_REQUESTS.get(payload.requestId);
    if (!pending) return;

    window.clearTimeout(pending.timeoutId);
    FN_SOCKET_REQUESTS.delete(payload.requestId);

    debug("received GM roll application response", {
        requestId: payload.requestId,
        ok: payload.ok,
        itemName: payload.itemName,
        targetName: payload.targetName,
        applyPath: payload.applyPath,
        error: payload.error,
    });

    if (payload.ok) pending.resolve(payload);
    else pending.reject(new Error(payload.error ?? "GM roll application failed."));
}

export function getTargetArmorClass(token)
{
    return Number(token?.actor?.system?.attributes?.ac?.value ?? token?.actor?.system?.attributes?.ac?.flat ?? NaN);
}

export function getRollTotalValue(roll)
{
    if (!roll) return NaN;

    const directTotal = Number(roll.total);
    if (Number.isFinite(directTotal)) return directTotal;

    const resultTotal = Number(roll.result?.total);
    if (Number.isFinite(resultTotal)) return resultTotal;

    const termsTotal = Number(roll._total);
    if (Number.isFinite(termsTotal)) return termsTotal;

    return NaN;
}

export function createRollApplicationHandlers({
    debug,
    restoreLastAttackControlFocus,
})
{
    function handleModuleSocketMessage(payload)
    {
        debug("received module socket message", {
            type: payload?.type,
            requestId: payload?.requestId,
            requesterId: payload?.requesterId,
            gmId: payload?.gmId,
            currentUserId: game.user?.id,
            isGM: game.user?.isGM,
        });

        if (!payload?.type) return;

        if (payload.type === FN_SOCKET_ACTIONS.APPLY_ROLL_RESULT)
        {
            void handleGMApplyRollResultRequest(payload, debug);
            return;
        }

        if (payload.type === FN_SOCKET_ACTIONS.APPLY_ROLL_RESULT_RESPONSE)
        {
            handleApplyRollResultResponse(payload, debug);
        }
    }

    async function handleRollDamageHook(rolls, data = {}, hookName = "dnd5e.rollDamage")
    {
        const pending = FN_SHEET_TABS_STATE.pendingRollApplication;
        debug("received damage roll hook", {
            hookName,
            hasPending: !!pending,
            pendingItemName: pending?.itemName,
            pendingTargetName: pending?.targetToken?.name,
            subjectType: data?.subject?.type,
            subjectItemName: data?.subject?.item?.name,
        });

        if (!pending?.targetToken?.actor) return;
        if (pending.activity && data.subject && pending.activity !== data.subject)
        {
            debug("ignored damage roll hook due to subject mismatch", {
                hookName,
                pendingItemName: pending.itemName,
                pendingActivityType: pending.activity?.type,
                subjectType: data.subject?.type,
                subjectItemName: data.subject?.item?.name,
            });
            return;
        }

        const roll = Array.isArray(rolls) ? rolls[0] : null;
        const damageTotal = getRollTotalValue(roll);
        const rollType = roll?.parent?.flags?.dnd5e?.roll?.type;
        const isHealingRoll = rollType === "healing" || data?.subject?.type === "heal";
        const appliedAmount = isHealingRoll ? -Math.abs(damageTotal) : damageTotal;
        debug("damage roll payload snapshot", {
            itemName: pending.itemName,
            targetName: pending.targetToken.name,
            rollCount: Array.isArray(rolls) ? rolls.length : 0,
            damageTotal,
            appliedAmount,
            rollType,
            isHealingRoll,
            rollSummary: roll
                ? {
                    constructorName: roll.constructor?.name,
                    total: roll.total,
                    _total: roll._total,
                    resultTotal: roll.result?.total,
                    formula: roll.formula,
                }
                : null,
        });
        if (!Number.isFinite(damageTotal)) return;

        FN_SHEET_TABS_STATE.pendingRollApplication = null;
        FN_SHEET_TABS_STATE.pendingConsumableApplication = null;

        try
        {
            const applyOptions = {
                isDelta: true,
                originatingMessage: roll?.parent ?? null,
            };
            let applyPath = "actor";

            if (!game.user.isGM && !canCurrentUserApplyToTarget(pending.targetToken))
            {
                const response = await requestGMApplyRollResult({
                    targetToken: pending.targetToken,
                    appliedAmount,
                    originatingMessage: roll?.parent ?? null,
                    itemName: pending.itemName,
                    targetName: pending.targetToken.name,
                    rollType,
                    isHealingRoll,
                    damageTotal,
                    debug,
                });
                applyPath = `gm:${response.applyPath ?? "unknown"}`;
            }
            else
            {
                applyPath = await applyRollResultToTarget(pending.targetToken, appliedAmount, applyOptions);
            }

            debug("applied roll result to selected target", {
                itemName: pending.itemName,
                targetName: pending.targetToken.name,
                damageTotal,
                appliedAmount,
                rollType,
                isHealingRoll,
                applyPath,
            });
            restoreLastAttackControlFocus();
        }
        catch (error)
        {
            debug("failed to apply damage to selected target", {
                itemName: pending.itemName,
                targetName: pending.targetToken.name,
                damageTotal,
                error: error?.message ?? String(error),
            });
            restoreLastAttackControlFocus();
        }
    }

    return {
        handleModuleSocketMessage,
        handleRollDamageHook,
    };
}
