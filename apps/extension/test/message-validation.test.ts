import assert from "node:assert/strict";
import test from "node:test";

import { isBackgroundMessage } from "@encrypted-id-vault/security";

test("isBackgroundMessage accepts a valid vault/getStatus envelope", () => {
    const message = {
        id: "msg-1",
        type: "vault/getStatus",
        source: "popup",
        target: "background",
        payload: {}
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects messages not targeting background", () => {
    const message = {
        id: "msg-2",
        type: "vault/getStatus",
        source: "popup",
        target: "popup",
        payload: {}
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects vault/unlock with an empty master password", () => {
    const message = {
        id: "msg-3",
        type: "vault/unlock",
        source: "popup",
        target: "background",
        payload: { masterPassword: "   " }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects vault/lock with an unknown reason", () => {
    const message = {
        id: "msg-4",
        type: "vault/lock",
        source: "popup",
        target: "background",
        payload: { reason: "invalid" }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects sync/connectProvider at the background boundary", () => {
    const message = {
        id: "msg-5",
        type: "sync/connectProvider",
        source: "popup",
        target: "background",
        payload: { provider: "drive" }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects extra payload keys", () => {
    const message = {
        id: "msg-6",
        type: "vault/getStatus",
        source: "popup",
        target: "background",
        payload: { unexpected: true }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage accepts valid vault/create envelopes", () => {
    const message = {
        id: "msg-6b",
        type: "vault/create",
        source: "popup",
        target: "background",
        payload: { masterPassword: "correct horse battery staple" }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects messages from non-popup sources", () => {
    const message = {
        id: "msg-7",
        type: "vault/getStatus",
        source: "content-script",
        target: "background",
        payload: {}
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects messages with a blank id", () => {
    const message = {
        id: "   ",
        type: "vault/getStatus",
        source: "popup",
        target: "background",
        payload: {}
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects messages with a blank type", () => {
    const message = {
        id: "msg-9",
        type: "  ",
        source: "popup",
        target: "background",
        payload: {}
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects vault/create with blank password", () => {
    const message = {
        id: "msg-10",
        type: "vault/create",
        source: "popup",
        target: "background",
        payload: { masterPassword: "   " }
    };

    assert.equal(isBackgroundMessage(message), false);
});
