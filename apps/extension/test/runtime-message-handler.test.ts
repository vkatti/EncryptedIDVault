import assert from "node:assert/strict";
import test from "node:test";

import type { VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { handleRuntimeMessage } from "../src/background/runtimeMessageHandler";
import type { RuntimeStateSnapshot } from "../src/background/messageRouter";

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

test("handleRuntimeMessage rejects invalid envelopes without mutating runtime state", () => {
    const runtimeState = createRuntimeState();
    const result = handleRuntimeMessage(
        { id: "bad-1", type: "vault/getStatus", source: "popup", target: "background", payload: { unexpected: true } },
        runtimeState,
        createStatusMessage,
        "2026-07-16T00:02:00.000Z"
    );

    assert.deepEqual(result, { ok: false, error: "ERR_INVALID_MESSAGE" });
    assert.equal(runtimeState.lastMessageAt, "2026-07-16T00:01:00.000Z");
    assert.equal(runtimeState.locked, true);
});

test("handleRuntimeMessage updates lastMessageAt and routes valid unlock messages", () => {
    const runtimeState = createRuntimeState();
    const result = handleRuntimeMessage(
        {
            id: "msg-2",
            type: "vault/unlock",
            source: "popup",
            target: "background",
            payload: { masterPassword: "demo-password" }
        },
        runtimeState,
        createStatusMessage,
        "2026-07-16T00:03:00.000Z"
    );

    assert.equal(result.ok, true);
    assert.equal(runtimeState.locked, false);
    assert.equal(runtimeState.lastMessageAt, "2026-07-16T00:03:00.000Z");
});

test("handleRuntimeMessage routes valid getStatus messages", () => {
    const runtimeState = createRuntimeState();
    const result = handleRuntimeMessage(
        {
            id: "msg-3",
            type: "vault/getStatus",
            source: "popup",
            target: "background",
            payload: {}
        },
        runtimeState,
        createStatusMessage,
        "2026-07-16T00:04:00.000Z"
    );

    assert.equal(result.ok, true);
    if ("state" in result) {
        assert.equal(result.state.lastMessageAt, "2026-07-16T00:04:00.000Z");
        assert.equal(result.message.type, "vault/getStatus");
        return;
    }

    assert.fail("Expected status response");
});
