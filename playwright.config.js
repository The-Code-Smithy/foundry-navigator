// Local-only smoke-test config for Foundry.
// Assumptions:
// - Foundry is already running at http://localhost:30000
// - A world is already up and reachable
// - The player "Tester The Brave" can join without a password
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests/playwright",
    timeout: 60_000,
    workers: 1,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL: "http://localhost:30000",
        headless: false,
        viewport: {
            width: 1024,
            height: 768,
        },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "off",
    },
});
