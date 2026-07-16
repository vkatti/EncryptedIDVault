import assert from "node:assert/strict";
import test from "node:test";

import { createVaultDocument, createVaultRepository, createMemoryVaultRecordStore } from "../src/index.js";

test("vault repository stores and reads an envelope", async () => {
    const store = createMemoryVaultRecordStore();
    const repository = createVaultRepository(store);
    const document = createVaultDocument("vault-test-repository");

    assert.equal(await repository.hasVault(), false);

    const envelope = {
        schemaVersion: 1,
        vaultId: document.vaultId,
        kdf: {
            name: "pbkdf2",
            salt: "c2FsdA==",
            iterations: 210000
        },
        encryption: {
            algorithm: "AES-GCM",
            nonce: "bm9uY2U="
        },
        ciphertext: "Y2lwaGVydGV4dA==",
        integrity: {
            method: "hmac",
            value: "aW50ZWdyaXR5"
        },
        meta: document.metadata
    };

    await repository.saveEnvelope(envelope);

    assert.equal(await repository.hasVault(), true);
    assert.deepEqual(await repository.readEnvelope(), envelope);

    await repository.clear();

    assert.equal(await repository.hasVault(), false);
});
