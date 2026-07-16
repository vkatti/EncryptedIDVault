import assert from "node:assert/strict";
import test from "node:test";

import type { VaultDocument } from "@encrypted-id-vault/shared";

import { createVaultEnvelope, openVaultEnvelope } from "../src/index.js";

test("crypto can round-trip a vault document", async () => {
    const document: VaultDocument = {
        schemaVersion: 1,
        vaultId: "vault-test-roundtrip",
        entries: [],
        preferences: {
            autoLockMinutes: 5,
            defaultInsertMode: "insert",
            clipboardWarningEnabled: true,
            theme: "system",
            telemetryEnabled: false
        },
        metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncProvider: null
        }
    };

    const envelope = await createVaultEnvelope(document, "correct horse battery staple");
    const result = await openVaultEnvelope(envelope, "correct horse battery staple");

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.value.vaultId : null, document.vaultId);
    assert.equal(result.ok ? result.value.entries.length : -1, 0);
});

test("crypto rejects the wrong password", async () => {
    const document: VaultDocument = {
        schemaVersion: 1,
        vaultId: "vault-test-wrong-password",
        entries: [],
        preferences: {
            autoLockMinutes: 5,
            defaultInsertMode: "insert",
            clipboardWarningEnabled: true,
            theme: "system",
            telemetryEnabled: false
        },
        metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncProvider: null
        }
    };
    const envelope = await createVaultEnvelope(document, "correct horse battery staple");
    const result = await openVaultEnvelope(envelope, "wrong password");

    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.error.code, "ERR_UNLOCK_INVALID_PASSWORD");
});
