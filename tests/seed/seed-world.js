// Resets the disposable test world to a known state for the Playwright suite.
//
// Prerequisites:
// - The "foundry-navigator-tests" world is running at FOUNDRY_URL
// - Foundry Navigator, Tidy 5e Sheets, and libWrapper are enabled in it
// - The Gamemaster user has no password and nobody is logged in as Gamemaster
//
// This deletes every actor, scene, combat, and chat message in the world, so it
// refuses to run against any other world.
const { chromium } = require("@playwright/test");

const BASE_URL = process.env.FOUNDRY_URL ?? "http://localhost:30000";
const TEST_WORLD_ID = "foundry-navigator-tests";
const GM_USER_NAME = "Gamemaster";

async function assertTestWorldActive()
{
    const response = await fetch(`${BASE_URL}/api/status`);
    const status = await response.json();
    if (status.world !== TEST_WORLD_ID)
    {
        throw new Error(`Expected world "${TEST_WORLD_ID}" at ${BASE_URL}, found "${status.world ?? "none"}".`);
    }
    return status;
}

async function joinAsGamemaster(page)
{
    await page.goto(`${BASE_URL}/join`);

    const joinForm = page.locator("#join-game-form");
    await joinForm.waitFor({ state: "visible", timeout: 30_000 });

    const userSelect = joinForm.locator('select[name="userid" i]');
    const gmUserId = await userSelect.evaluate((select, name) =>
        Array.from(select.options).find(option => option.textContent.trim() === name)?.value ?? null, GM_USER_NAME);
    if (!gmUserId) throw new Error(`No "${GM_USER_NAME}" user on the join page.`);

    await userSelect.selectOption(gmUserId);
    await joinForm.locator('button[name="join"]').click();

    await page.waitForURL("**/game", { timeout: 30_000 });
    // canvas.ready is not checked because a new world has no scene yet.
    await page.waitForFunction(() => Boolean(window.game?.ready), null, { timeout: 60_000 });
}

// Runs inside the browser as the Gamemaster.
async function seedWorld({ testWorldId })
{
    if (game.world.id !== testWorldId) throw new Error(`Refusing to seed world "${game.world.id}".`);

    const requiredModules = ["foundry-navigator", "tidy5e-sheet", "lib-wrapper"];
    const inactiveModules = requiredModules.filter(id => !game.modules.get(id)?.active);
    if (inactiveModules.length) throw new Error(`Enable these modules first: ${inactiveModules.join(", ")}`);

    const deleteAll = async (documentClass, collection) =>
    {
        const ids = collection.map(document => document.id);
        if (ids.length) await documentClass.deleteDocuments(ids);
    };
    await deleteAll(Combat, game.combats);
    await deleteAll(ChatMessage, game.messages);
    await deleteAll(Scene, game.scenes);
    await deleteAll(Actor, game.actors);

    const testerName = "Tester The Brave";
    let tester = game.users.getName(testerName);
    if (!tester)
    {
        tester = await User.create({ name: testerName, role: CONST.USER_ROLES.PLAYER });
    }

    const findCompendiumItem = async name =>
    {
        for (const packId of ["dnd5e.equipment24", "dnd5e.items"])
        {
            const pack = game.packs.get(packId);
            const entry = pack?.index.find(candidate => candidate.name === name);
            if (entry) return (await pack.getDocument(entry._id)).toObject();
        }
        throw new Error(`No compendium item named "${name}".`);
    };

    const weapons = await Promise.all(["Dagger", "Longsword"].map(async name =>
    {
        const item = await findCompendiumItem(name);
        item.system.equipped = true;
        return item;
    }));

    const character = await Actor.create({
        name: testerName,
        type: "character",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [tester.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        system: { attributes: { hp: { value: 20, max: 20 } } },
        prototypeToken: { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY },
        items: weapons,
    });
    await tester.update({ character: character.id });

    const createNpc = (name, disposition, hp) => Actor.create({
        name,
        type: "npc",
        system: { attributes: { hp: { value: hp, max: 7 } } },
        prototypeToken: { disposition },
    });
    const { HOSTILE, FRIENDLY, NEUTRAL } = CONST.TOKEN_DISPOSITIONS;
    const placements = [
        [character, 500, 500],
        [await createNpc("Test Goblin", HOSTILE, 7), 700, 500],
        [await createNpc("Test Dead Goblin", HOSTILE, 0), 800, 500],
        [await createNpc("Test Ally", FRIENDLY, 7), 500, 700],
        [await createNpc("Test Downed Ally", FRIENDLY, 0), 600, 700],
        [await createNpc("Test Commoner", NEUTRAL, 7), 700, 700],
    ];

    const scene = await Scene.create({
        name: "Test Arena",
        width: 2000,
        height: 2000,
        padding: 0,
        grid: { type: CONST.GRID_TYPES.SQUARE, size: 100 },
        tokenVision: false,
    });
    const tokens = await Promise.all(placements.map(async ([actor, x, y]) =>
        (await actor.getTokenDocument({ x, y })).toObject()));
    await scene.createEmbeddedDocuments("Token", tokens);
    await scene.activate();

    return {
        user: tester.name,
        actors: game.actors.map(actor => actor.name),
        weapons: character.items.filter(item => item.type === "weapon").map(item => item.name),
        tokens: scene.tokens.size,
    };
}

(async () =>
{
    await assertTestWorldActive();

    const browser = await chromium.launch({ headless: true });
    try
    {
        const page = await browser.newPage();
        await joinAsGamemaster(page);
        const summary = await page.evaluate(seedWorld, { testWorldId: TEST_WORLD_ID });
        console.log("Seeded test world:", JSON.stringify(summary, null, 2));
    }
    finally
    {
        await browser.close();
    }
})().catch(error =>
{
    console.error(error.message);
    process.exitCode = 1;
});
