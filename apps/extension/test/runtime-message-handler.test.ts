import assert from "node:assert/strict";
import test from "node:test";

import type { VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { handleRuntimeMessage } from "../src/background/runtimeMessageHandler";
import type { RuntimeStateSnapshot } from "../src/background/messageRouter";
import type { VaultLifecycle } from "../src/background/vaultLifecycle";

function createRuntimeState(): RuntimeStateSnapshot {
    return {
        installedAt: "2026-07-16T00:00:00.000Z",
        lastMessageAt: "2026-07-16T00:01:00.000Z",
        lastUserTrigger: "command:open-vault-popup",
        lastUnlockedAt: null,
        locked: true,
        hasVault: false,
        preferences: null
    };
}

function createStatusMessage(): VaultGetStatusMessage {
    return {
        id: "status-message-id",
        type: "vault/getStatus",
        source: "background",
        target: "popup",
        payload: {}
    };
}

function createVaultLifecycle(): VaultLifecycle {
    return {
        async initialize() {
            return { hasVault: false, locked: true, lastUnlockedAt: null };
        },
        getAutoLockMinutes() {
            return 5;
        },
        getStatus() {
            return { hasVault: false, locked: true, lastUnlockedAt: null, preferences: null };
        },
        async createVault() {
            return { ok: true, hasVault: true, locked: false };
        },
        async unlockVault() {
            return { ok: true, hasVault: true, locked: false };
        },
        async lockVault() {
            return { ok: true, hasVault: true, locked: true };
        },
        async updatePreferences() {
            return { ok: true, hasVault: true, locked: false };
        },
        async exportVaultFile() {
            return {
                ok: true,
                file: {
                    formatVersion: 1,
                    exportedAt: "2026-07-16T00:00:00.000Z",
                    envelope: {
                        schemaVersion: 1,
                        vaultId: "vault-1",
                        kdf: { name: "pbkdf2", salt: "salt", iterations: 10 },
                        encryption: { algorithm: "AES-GCM", nonce: "nonce" },
                        ciphertext: "ciphertext",
                        integrity: { method: "hmac", value: "tag" },
                        meta: {
                            createdAt: "2026-07-16T00:00:00.000Z",
                            updatedAt: "2026-07-16T00:00:00.000Z",
                            syncProvider: null
                        }
                    }
                }
            };
        },
        async importVaultFile(_file, _masterPassword, mode) {
            return { ok: true, mode, entryCount: 1 };
        },
        async listEntries() {
            return { ok: true, entries: [] };
        },
        async createEntry() {
            return {
                ok: true,
                entry: {
                    id: "entry-1",
                    label: "Email",
                    value: "demo@example.com",
                    category: "identity",
                    maskedPreview: "****.com",
                    favorite: false,
                    createdAt: "2026-07-16T00:00:00.000Z",
                    updatedAt: "2026-07-16T00:00:00.000Z",
                    copyModeAllowed: true,
                    insertModeAllowed: true
                }
            };
        },
        async updateEntry() {
            return {
                ok: true,
                entry: {
                    id: "entry-1",
                    label: "Work Email",
                    value: "work@example.com",
                    category: "identity",
                    maskedPreview: "****.com",
                    favorite: true,
                    createdAt: "2026-07-16T00:00:00.000Z",
                    updatedAt: "2026-07-16T00:01:00.000Z",
                    copyModeAllowed: true,
                    insertModeAllowed: true
                }
            };
        },
        async deleteEntry(entryId) {
            return { ok: true, deletedEntryId: entryId };
        },
        async reorderEntry() {
            return {
                ok: true,
                entry: {
                    id: "entry-1",
                    label: "Email",
                    value: "demo@example.com",
                    category: "identity",
                    maskedPreview: "****.com",
                    favorite: false,
                    createdAt: "2026-07-16T00:00:00.000Z",
                    updatedAt: "2026-07-16T00:02:00.000Z",
                    copyModeAllowed: true,
                    insertModeAllowed: true
                }
            };
        }
    };
}

test("handleRuntimeMessage rejects invalid envelopes without mutating runtime state", async () => {
    const runtimeState = createRuntimeState();
    const result = await handleRuntimeMessage(
        { id: "bad-1", type: "vault/getStatus", source: "popup", target: "background", payload: { unexpected: true } },
        runtimeState,
        createStatusMessage,
        createVaultLifecycle(),
        "2026-07-16T00:02:00.000Z"
    );

    assert.deepEqual(result, { ok: false, error: "ERR_INVALID_MESSAGE" });
    assert.equal(runtimeState.lastMessageAt, "2026-07-16T00:01:00.000Z");
    assert.equal(runtimeState.locked, true);
});

test("handleRuntimeMessage updates lastMessageAt and routes valid unlock messages", async () => {
    const runtimeState = createRuntimeState();
    const result = await handleRuntimeMessage(
        {
            id: "msg-2",
            type: "vault/unlock",
            source: "popup",
            target: "background",
            payload: { masterPassword: "demo-password" }
        },
        runtimeState,
        createStatusMessage,
        createVaultLifecycle(),
        "2026-07-16T00:03:00.000Z"
    );

    assert.equal(result.ok, true);
    assert.equal(runtimeState.locked, false);
    assert.equal(runtimeState.lastMessageAt, "2026-07-16T00:03:00.000Z");
});

test("handleRuntimeMessage routes valid getStatus messages", async () => {
    const runtimeState = createRuntimeState();
    const result = await handleRuntimeMessage(
        {
            id: "msg-3",
            type: "vault/getStatus",
            source: "popup",
            target: "background",
            payload: {}
        },
        runtimeState,
        createStatusMessage,
        createVaultLifecycle(),
        "2026-07-16T00:04:00.000Z"
    );

    assert.equal(result.ok, true);
    if ("state" in result) {
        assert.equal(result.state.lastMessageAt, "2026-07-16T00:01:00.000Z");
        assert.equal(result.message.type, "vault/getStatus");
        assert.equal(result.state.lastUnlockedAt, null);
        assert.equal(runtimeState.lastMessageAt, "2026-07-16T00:01:00.000Z");
        return;
    }

    assert.fail("Expected status response");
});

test("handleRuntimeMessage routes valid entries/insert messages", async () => {
    const runtimeState = createRuntimeState();
    const result = await handleRuntimeMessage(
        {
            id: "msg-4",
            type: "entries/insert",
            source: "popup",
            target: "background",
            payload: {
                entryId: "entry-1"
            }
        },
        runtimeState,
        createStatusMessage,
        createVaultLifecycle(),
        "2026-07-16T00:05:00.000Z",
        async () => ({ ok: true, insertedEntryId: "entry-1", insertionMode: "insert" })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.insertedEntryId, "entry-1");
        assert.equal(result.insertionMode, "insert");
    }
});

test("handleRuntimeMessage forwards sender tab id to insert routing", async () => {
    const runtimeState = createRuntimeState();
    let capturedTabId: number | undefined;

    const result = await handleRuntimeMessage(
        {
            id: "msg-5",
            type: "entries/insert",
            source: "popup",
            target: "background",
            payload: {
                entryId: "entry-1"
            }
        },
        runtimeState,
        createStatusMessage,
        createVaultLifecycle(),
        "2026-07-16T00:06:00.000Z",
        async (params) => {
            capturedTabId = params.tabId;
            return { ok: true, insertedEntryId: params.entryId, insertionMode: "insert" };
        },
        91
    );

    assert.equal(result.ok, true);
    assert.equal(capturedTabId, 91);
});
