import assert from "node:assert/strict";
import test from "node:test";

import type { BackgroundMessage, VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { routeBackgroundMessage, type RuntimeStateSnapshot } from "../src/background/messageRouter";
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

function createVaultLifecycle(overrides?: Partial<VaultLifecycle>): VaultLifecycle {
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
        },
        ...overrides
    };
}

test("routeBackgroundMessage returns status payload for vault/getStatus", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();
    const message = {
        id: "message-1",
        type: "vault/getStatus",
        source: "popup",
        target: "background",
        payload: {}
    } satisfies BackgroundMessage;

    const result = await routeBackgroundMessage(message, runtimeState, createStatusMessage, vaultLifecycle);

    assert.equal(result.ok, true);
    if ("state" in result) {
        assert.equal(result.state.lastUserTrigger, "command:open-vault-popup");
        assert.equal(result.message.type, "vault/getStatus");
        assert.equal(result.state.lastUnlockedAt, null);
    } else {
        assert.fail("Expected status response");
    }
});

test("routeBackgroundMessage mutates lock state for vault/create, vault/unlock and vault/lock", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();

    const createMessage = {
        id: "message-0",
        type: "vault/create",
        source: "popup",
        target: "background",
        payload: { masterPassword: "demo-password" }
    } satisfies BackgroundMessage;

    const createResult = await routeBackgroundMessage(createMessage, runtimeState, createStatusMessage, vaultLifecycle);

    assert.equal(createResult.ok, true);
    assert.equal(runtimeState.hasVault, true);
    assert.equal(runtimeState.locked, false);

    const unlockMessage = {
        id: "message-2",
        type: "vault/unlock",
        source: "popup",
        target: "background",
        payload: { masterPassword: "demo-password" }
    } satisfies BackgroundMessage;

    const unlockResult = await routeBackgroundMessage(unlockMessage, runtimeState, createStatusMessage, vaultLifecycle);

    assert.equal(unlockResult.ok, true);
    assert.equal(runtimeState.locked, false);

    const lockMessage = {
        id: "message-3",
        type: "vault/lock",
        source: "popup",
        target: "background",
        payload: { reason: "manual" }
    } satisfies BackgroundMessage;

    const lockResult = await routeBackgroundMessage(lockMessage, runtimeState, createStatusMessage, vaultLifecycle);

    assert.equal(lockResult.ok, true);
    assert.equal(runtimeState.locked, true);
});

test("routeBackgroundMessage routes vault/export and vault/import", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();

    const exportMessage = {
        id: "message-export",
        type: "vault/export",
        source: "popup",
        target: "background",
        payload: {}
    } satisfies BackgroundMessage;

    const exportResult = await routeBackgroundMessage(exportMessage, runtimeState, createStatusMessage, vaultLifecycle);
    assert.equal(exportResult.ok, true);
    let exportedFile: Extract<typeof exportResult, { ok: true; file: unknown }>["file"] | null = null;
    if ("file" in exportResult) {
        assert.equal(exportResult.file.formatVersion, 1);
        exportedFile = exportResult.file;
    } else {
        assert.fail("Expected vault export response");
    }

    if (!exportedFile) {
        assert.fail("Missing exported file payload");
    }

    const importMessage = {
        id: "message-import",
        type: "vault/import",
        source: "popup",
        target: "background",
        payload: {
            file: exportedFile,
            masterPassword: "demo-password",
            mode: "replace"
        }
    } satisfies BackgroundMessage;

    const importResult = await routeBackgroundMessage(importMessage, runtimeState, createStatusMessage, vaultLifecycle);
    assert.equal(importResult.ok, true);
    if ("mode" in importResult) {
        assert.equal(importResult.mode, "replace");
        assert.equal(importResult.entryCount, 1);
        return;
    }

    assert.fail("Expected vault import response");
});

test("routeBackgroundMessage routes entries/list responses", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();
    const message = {
        id: "message-4",
        type: "entries/list",
        source: "popup",
        target: "background",
        payload: {}
    } satisfies BackgroundMessage;

    const result = await routeBackgroundMessage(message, runtimeState, createStatusMessage, vaultLifecycle);

    assert.equal(result.ok, true);
    if ("entries" in result) {
        assert.equal(result.entries.length, 0);
        return;
    }

    assert.fail("Expected entries list response");
});

test("routeBackgroundMessage routes entries/create and entries/update", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();

    const createMessage = {
        id: "message-5",
        type: "entries/create",
        source: "popup",
        target: "background",
        payload: {
            label: "Email",
            value: "demo@example.com",
            category: "identity"
        }
    } satisfies BackgroundMessage;

    const createResult = await routeBackgroundMessage(createMessage, runtimeState, createStatusMessage, vaultLifecycle);
    assert.equal(createResult.ok, true);
    if ("entry" in createResult) {
        assert.equal(createResult.entry.label, "Email");
    } else {
        assert.fail("Expected create entry response");
    }

    const updateMessage = {
        id: "message-6",
        type: "entries/update",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            label: "Work Email",
            favorite: true
        }
    } satisfies BackgroundMessage;

    const updateResult = await routeBackgroundMessage(updateMessage, runtimeState, createStatusMessage, vaultLifecycle);
    assert.equal(updateResult.ok, true);
    if ("entry" in updateResult) {
        assert.equal(updateResult.entry.label, "Work Email");
        assert.equal(updateResult.entry.favorite, true);
        return;
    }

    assert.fail("Expected update entry response");
});

test("routeBackgroundMessage routes entries/delete", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();

    const deleteMessage = {
        id: "message-7",
        type: "entries/delete",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1"
        }
    } satisfies BackgroundMessage;

    const deleteResult = await routeBackgroundMessage(deleteMessage, runtimeState, createStatusMessage, vaultLifecycle);
    assert.equal(deleteResult.ok, true);
    if ("deletedEntryId" in deleteResult) {
        assert.equal(deleteResult.deletedEntryId, "entry-1");
        return;
    }

    assert.fail("Expected delete entry response");
});

test("routeBackgroundMessage routes entries/reorder", async () => {
    const runtimeState = createRuntimeState();
    const vaultLifecycle = createVaultLifecycle();

    const reorderMessage = {
        id: "message-8",
        type: "entries/reorder",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            targetIndex: 0
        }
    } satisfies BackgroundMessage;

    const reorderResult = await routeBackgroundMessage(reorderMessage, runtimeState, createStatusMessage, vaultLifecycle);
    assert.equal(reorderResult.ok, true);
    if ("entry" in reorderResult) {
        assert.equal(reorderResult.entry.id, "entry-1");
        return;
    }

    assert.fail("Expected reorder entry response");
});
