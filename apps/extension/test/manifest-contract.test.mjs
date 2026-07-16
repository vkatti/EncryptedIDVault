import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(testDir, "..");
const manifestPath = path.join(extensionDir, "manifest.json");

async function readManifest() {
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw);
}

test("manifest declares context menu capability", async () => {
    const manifest = await readManifest();

    assert.ok(Array.isArray(manifest.permissions));
    assert.ok(manifest.permissions.includes("contextMenus"));
    assert.ok(manifest.permissions.includes("alarms"));
});

test("manifest declares expected keyboard commands", async () => {
    const manifest = await readManifest();

    assert.ok(manifest.commands);
    assert.ok(manifest.commands["open-vault-popup"]);
    assert.ok(manifest.commands["insert-selected-entry"]);
    assert.equal(manifest.commands["open-vault-popup"].suggested_key.default, "Ctrl+Shift+Y");
    assert.equal(manifest.commands["insert-selected-entry"].suggested_key.default, "Ctrl+Shift+I");
});
