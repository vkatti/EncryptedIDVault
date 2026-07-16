import assert from "node:assert/strict";
import test from "node:test";

import type { BackgroundMessage, VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { routeBackgroundMessage, type RuntimeStateSnapshot } from "../src/background/messageRouter";

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

test("routeBackgroundMessage returns status payload for vault/getStatus", () => {
    const runtimeState = createRuntimeState();
    const message = {
        id: "message-1",
        type: "vault/getStatus",
        source: "popup",
        target: "background",
        payload: {}
    } satisfies BackgroundMessage;

    const result = routeBackgroundMessage(message, runtimeState, createStatusMessage);

    assert.equal(result.ok, true);
    if ("state" in result) {
        assert.equal(result.state.lastUserTrigger, "command:open-vault-popup");
        assert.equal(result.message.type, "vault/getStatus");
    } else {
        assert.fail("Expected status response");
    }
});

test("routeBackgroundMessage mutates lock state for vault/unlock and vault/lock", () => {
    const runtimeState = createRuntimeState();

    const unlockMessage = {
        id: "message-2",
        type: "vault/unlock",
        source: "popup",
        target: "background",
        payload: { masterPassword: "demo-password" }
    } satisfies BackgroundMessage;

    const unlockResult = routeBackgroundMessage(unlockMessage, runtimeState, createStatusMessage);

    assert.equal(unlockResult.ok, true);
    assert.equal(runtimeState.locked, false);

    const lockMessage = {
        id: "message-3",
        type: "vault/lock",
        source: "popup",
        target: "background",
        payload: { reason: "manual" }
    } satisfies BackgroundMessage;

    const lockResult = routeBackgroundMessage(lockMessage, runtimeState, createStatusMessage);

    assert.equal(lockResult.ok, true);
    assert.equal(runtimeState.locked, true);
});

test("routeBackgroundMessage rejects unhandled but schema-valid messages", () => {
    const runtimeState = createRuntimeState();
    const message = {
        id: "message-4",
        type: "entries/list",
        source: "popup",
        target: "background",
        payload: {}
    } satisfies BackgroundMessage;

    const result = routeBackgroundMessage(message, runtimeState, createStatusMessage);

    assert.deepEqual(result, { ok: false, error: "ERR_UNHANDLED_MESSAGE" });
});
