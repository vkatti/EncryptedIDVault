import assert from "node:assert/strict";
import test from "node:test";

import { getVaultExportErrorMessage, getVaultImportErrorMessage, isVaultExportFile } from "../src/popup/Popup";

test("getVaultExportErrorMessage returns specific guidance when vault is missing", () => {
    const message = getVaultExportErrorMessage("ERR_VAULT_NOT_FOUND");

    assert.equal(message, "No vault exists yet. Create a vault before exporting.");
});

test("getVaultExportErrorMessage returns fallback guidance for unknown failures", () => {
    const message = getVaultExportErrorMessage("ERR_UNKNOWN");

    assert.equal(message, "Unable to export vault. Try again.");
});

test("getVaultImportErrorMessage maps expected import failure codes", () => {
    assert.equal(
        getVaultImportErrorMessage("ERR_UNLOCK_INVALID_PASSWORD"),
        "Import failed: the master password does not match the imported vault."
    );
    assert.equal(
        getVaultImportErrorMessage("ERR_IMPORT_SCHEMA_UNSUPPORTED"),
        "Import failed: this vault file uses an unsupported schema version."
    );
    assert.equal(
        getVaultImportErrorMessage("ERR_VAULT_CORRUPT"),
        "Import failed: the vault file appears corrupted or tampered."
    );
});

test("getVaultImportErrorMessage returns fallback guidance for unknown failures", () => {
    const message = getVaultImportErrorMessage("ERR_UNKNOWN");

    assert.equal(message, "Unable to import vault. Verify the file and password, then try again.");
});

test("isVaultExportFile accepts minimal valid encrypted export files", () => {
    const candidate = {
        formatVersion: 1,
        exportedAt: "2026-07-18T00:00:00.000Z",
        envelope: {
            schemaVersion: 1,
            vaultId: "vault-1",
            kdf: {
                name: "pbkdf2",
                salt: "salt"
            },
            encryption: {
                algorithm: "AES-GCM",
                nonce: "nonce"
            },
            ciphertext: "ciphertext",
            integrity: {
                method: "hmac",
                value: "tag"
            },
            meta: {
                createdAt: "2026-07-18T00:00:00.000Z",
                updatedAt: "2026-07-18T00:00:00.000Z",
                syncProvider: null
            }
        }
    };

    assert.equal(isVaultExportFile(candidate), true);
});

test("isVaultExportFile rejects malformed exports", () => {
    assert.equal(isVaultExportFile(null), false);
    assert.equal(isVaultExportFile({ formatVersion: 2 }), false);
    assert.equal(isVaultExportFile({ formatVersion: 1, exportedAt: "2026-07-18T00:00:00.000Z" }), false);
});