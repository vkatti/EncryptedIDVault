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

function createVaultLifecycle(overrides?: Partial<VaultLifecycle>): VaultLifecycle {
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

test("routeBackgroundMessage rejects unhandled but schema-valid messages", async () => {
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

    assert.deepEqual(result, { ok: false, error: "ERR_UNHANDLED_MESSAGE" });
});
