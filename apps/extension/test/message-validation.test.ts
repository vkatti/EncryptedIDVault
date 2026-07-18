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

test("isBackgroundMessage accepts valid vault/updatePreferences envelopes", () => {
    const message = {
        id: "msg-6c",
        type: "vault/updatePreferences",
        source: "popup",
        target: "background",
        payload: {
            autoLockMinutes: 10,
            defaultInsertMode: "copy",
            clipboardWarningEnabled: false,
            theme: "dark",
            telemetryEnabled: false
        }
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

test("isBackgroundMessage accepts vault/export with empty payload", () => {
    const message = {
        id: "msg-10b",
        type: "vault/export",
        source: "popup",
        target: "background",
        payload: {}
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage accepts vault/import with a valid export file", () => {
    const message = {
        id: "msg-10c",
        type: "vault/import",
        source: "popup",
        target: "background",
        payload: {
            file: {
                formatVersion: 1,
                exportedAt: "2026-07-18T00:00:00.000Z",
                envelope: {
                    schemaVersion: 1,
                    vaultId: "vault-1",
                    kdf: { name: "pbkdf2", salt: "salt", iterations: 10 },
                    encryption: { algorithm: "AES-GCM", nonce: "nonce" },
                    ciphertext: "ciphertext",
                    integrity: { method: "hmac", value: "tag" },
                    meta: {
                        createdAt: "2026-07-18T00:00:00.000Z",
                        updatedAt: "2026-07-18T00:00:00.000Z",
                        syncProvider: null
                    }
                }
            },
            masterPassword: "correct horse battery staple",
            mode: "merge"
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects vault/import with invalid mode", () => {
    const message = {
        id: "msg-10d",
        type: "vault/import",
        source: "popup",
        target: "background",
        payload: {
            file: {
                formatVersion: 1,
                exportedAt: "2026-07-18T00:00:00.000Z",
                envelope: {
                    schemaVersion: 1,
                    vaultId: "vault-1",
                    kdf: { name: "pbkdf2", salt: "salt", iterations: 10 },
                    encryption: { algorithm: "AES-GCM", nonce: "nonce" },
                    ciphertext: "ciphertext",
                    integrity: { method: "hmac", value: "tag" },
                    meta: {
                        createdAt: "2026-07-18T00:00:00.000Z",
                        updatedAt: "2026-07-18T00:00:00.000Z",
                        syncProvider: null
                    }
                }
            },
            masterPassword: "correct horse battery staple",
            mode: "append"
        }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage rejects vault/updatePreferences with an invalid field value", () => {
    const message = {
        id: "msg-11",
        type: "vault/updatePreferences",
        source: "popup",
        target: "background",
        payload: {
            autoLockMinutes: -1
        }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage accepts entries/list with valid filters", () => {
    const message = {
        id: "msg-12",
        type: "entries/list",
        source: "popup",
        target: "background",
        payload: {
            query: "email",
            favoritesOnly: true
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage accepts entries/create with required fields", () => {
    const message = {
        id: "msg-13",
        type: "entries/create",
        source: "popup",
        target: "background",
        payload: {
            label: "Primary Email",
            value: "demo@example.com",
            category: "identity",
            favorite: true
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects entries/update without update fields", () => {
    const message = {
        id: "msg-14",
        type: "entries/update",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1"
        }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage accepts entries/update with valid patch", () => {
    const message = {
        id: "msg-15",
        type: "entries/update",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            label: "Work Email",
            favorite: true
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage accepts entries/delete with valid payload", () => {
    const message = {
        id: "msg-16",
        type: "entries/delete",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1"
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects entries/delete with invalid payload", () => {
    const message = {
        id: "msg-17",
        type: "entries/delete",
        source: "popup",
        target: "background",
        payload: {
            entryId: "  ",
            unexpected: true
        }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage accepts entries/insert with a fallback flag", () => {
    const message = {
        id: "msg-18",
        type: "entries/insert",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            fallbackToClipboard: true
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage accepts entries/insert with tab id", () => {
    const message = {
        id: "msg-18b",
        type: "entries/insert",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            tabId: 123
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects entries/insert with unexpected payload keys", () => {
    const message = {
        id: "msg-19",
        type: "entries/insert",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            extra: true
        }
    };

    assert.equal(isBackgroundMessage(message), false);
});

test("isBackgroundMessage accepts entries/reorder with valid payload", () => {
    const message = {
        id: "msg-18",
        type: "entries/reorder",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            targetIndex: 2
        }
    };

    assert.equal(isBackgroundMessage(message), true);
});

test("isBackgroundMessage rejects entries/reorder with invalid payload", () => {
    const message = {
        id: "msg-19",
        type: "entries/reorder",
        source: "popup",
        target: "background",
        payload: {
            entryId: "entry-1",
            targetIndex: -1
        }
    };

    assert.equal(isBackgroundMessage(message), false);
});
