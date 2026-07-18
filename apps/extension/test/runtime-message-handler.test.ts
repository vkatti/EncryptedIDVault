import assert from "node:assert/strict";
import test from "node:test";

import type { VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { handleRuntimeMessage } from "../src/background/runtimeMessageHandler";
import type { BillingLifecycle } from "../src/background/billingLifecycle";
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

function createBillingLifecycle(): BillingLifecycle {
    const snapshot = {
        accountId: null,
        tier: "free" as const,
        state: "active" as const,
        expiresAt: null,
        checkedAt: null,
        source: "default" as const,
        syncProvider: null,
        syncEnabled: false
    };

    return {
        async initialize() {
            return undefined;
        },
        getSnapshot() {
            return snapshot;
        },
        async linkAccount() {
            return { ok: true, value: { accountId: "acct_123" } };
        },
        async startCheckout() {
            return { ok: true, value: { checkoutUrl: "https://billing.example.test/checkout" } };
        },
        async getEntitlement() {
            return { ok: true, value: snapshot };
        },
        async setSyncProvider(provider) {
            return { ok: true, value: { provider } };
        },
        async requestSync(action) {
            return { ok: false, error: "ERR_SYNC_REQUIRES_PRO" };
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
        createBillingLifecycle(),
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
        createBillingLifecycle(),
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
        createBillingLifecycle(),
        "2026-07-16T00:04:00.000Z"
    );

    assert.equal(result.ok, true);
    if ("state" in result) {
        assert.equal(result.state.lastMessageAt, "2026-07-16T00:04:00.000Z");
        assert.equal(result.message.type, "vault/getStatus");
        assert.equal(result.state.lastUnlockedAt, null);
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
        createBillingLifecycle(),
        "2026-07-16T00:05:00.000Z",
        async () => ({ ok: true, insertedEntryId: "entry-1", insertionMode: "insert" })
    );

    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.insertedEntryId, "entry-1");
        assert.equal(result.insertionMode, "insert");
    }
});
