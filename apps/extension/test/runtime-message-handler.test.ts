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
        hasVault: false
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
            return { hasVault: false, locked: true };
        },
        getStatus() {
            return { hasVault: false, locked: true };
        },
        getAutoLockMinutes() {
            return 5;
        },
        async createVault() {
            return { ok: true, hasVault: true, locked: false };
        },
        async unlockVault() {
            return { ok: true, hasVault: true, locked: false };
        },
        async lockVault() {
            return { ok: true, hasVault: true, locked: true };
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
        assert.equal(result.state.lastMessageAt, "2026-07-16T00:04:00.000Z");
        assert.equal(result.message.type, "vault/getStatus");
        assert.equal(result.state.lastUnlockedAt, null);
        return;
    }

    assert.fail("Expected status response");
});
