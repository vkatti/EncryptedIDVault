import assert from "node:assert/strict";
import test from "node:test";

import { createVaultRepository, createMemoryVaultRecordStore } from "@encrypted-id-vault/vault";

import { createVaultLifecycle } from "../src/background/vaultLifecycle";

function createLifecycle() {
    const repository = createVaultRepository(createMemoryVaultRecordStore());

    return createVaultLifecycle({
        repository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase1-test"
    });
}

test("vault lifecycle creates and persists an encrypted vault", async () => {
    const lifecycle = createLifecycle();

    const initialized = await lifecycle.initialize();
    assert.deepEqual(initialized, { hasVault: false, locked: true, lastUnlockedAt: null });

    const createResult = await lifecycle.createVault("correct horse battery staple");
    assert.equal(createResult.ok, true);

    const status = lifecycle.getStatus();
    assert.equal(status.hasVault, true);
    assert.equal(status.locked, false);
    assert.equal(lifecycle.getAutoLockMinutes(), 5);
    assert.equal(status.lastUnlockedAt, "2026-07-16T10:00:00.000Z");
});

test("vault lifecycle rejects duplicate vault creation", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    const duplicate = await lifecycle.createVault("another-password");

    assert.deepEqual(duplicate, { ok: false, error: "ERR_VAULT_ALREADY_EXISTS" });
});

test("vault lifecycle unlock fails with wrong password and succeeds with correct password", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    await lifecycle.lockVault();

    const wrong = await lifecycle.unlockVault("wrong password");
    assert.deepEqual(wrong, { ok: false, error: "ERR_UNLOCK_INVALID_PASSWORD" });

    const unlocked = await lifecycle.unlockVault("correct horse battery staple");
    assert.equal(unlocked.ok, true);
});

test("vault lifecycle returns not found when unlocking before create", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    const result = await lifecycle.unlockVault("missing");

    assert.deepEqual(result, { ok: false, error: "ERR_VAULT_NOT_FOUND" });
});

test("vault lifecycle initialize enforces locked state after vault exists", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const afterCreate = lifecycle.getStatus();
    assert.equal(afterCreate.locked, false);
    assert.equal(afterCreate.lastUnlockedAt, "2026-07-16T10:00:00.000Z");

    const afterInitialize = await lifecycle.initialize();
    assert.deepEqual(afterInitialize, { hasVault: true, locked: true, lastUnlockedAt: "2026-07-16T10:00:00.000Z" });
    assert.equal(lifecycle.getAutoLockMinutes(), null);
});

test("vault lifecycle lock clears unlocked session state", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    assert.equal(lifecycle.getAutoLockMinutes(), 5);

    await lifecycle.lockVault();
    assert.equal(lifecycle.getAutoLockMinutes(), null);
    assert.equal(lifecycle.getStatus().locked, true);
});

test("vault lifecycle updates preferences and persists them in the encrypted envelope", async () => {
    const store = createMemoryVaultRecordStore();
    const repository = createVaultRepository(store);
    const lifecycle = createVaultLifecycle({
        repository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase1-test"
    });

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const updateResult = await lifecycle.updatePreferences({
        autoLockMinutes: 15,
        defaultInsertMode: "copy",
        clipboardWarningEnabled: false,
        theme: "dark",
        telemetryEnabled: true
    });

    assert.equal(updateResult.ok, true);
    const envelope = await repository.readEnvelope();

    assert.ok(envelope);
    assert.equal(envelope?.meta.updatedAt, "2026-07-16T10:00:00.000Z");
    assert.equal(envelope?.meta.lastUnlockedAt, "2026-07-16T10:00:00.000Z");
    assert.equal(lifecycle.getStatus().preferences?.autoLockMinutes, 15);
    assert.equal(lifecycle.getStatus().preferences?.defaultInsertMode, "copy");
    assert.equal(lifecycle.getStatus().preferences?.clipboardWarningEnabled, false);
});

test("vault lifecycle creates, lists, and updates entries while unlocked", async () => {
    const store = createMemoryVaultRecordStore();
    const repository = createVaultRepository(store);
    const lifecycle = createVaultLifecycle({
        repository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase1-test"
    });

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const createResult = await lifecycle.createEntry({
        label: "Primary Email",
        value: "demo@example.com",
        category: "identity",
        favorite: true,
        notes: "Personal"
    });

    assert.equal(createResult.ok, true);
    if (!createResult.ok) {
        assert.fail("Expected entry to be created");
    }

    assert.equal(createResult.entry.label, "Primary Email");
    assert.equal(createResult.entry.favorite, true);
    assert.equal(createResult.entry.maskedPreview.endsWith(".com"), true);

    const listed = await lifecycle.listEntries({ favoritesOnly: true, query: "email" });
    assert.equal(listed.ok, true);
    if (!listed.ok) {
        assert.fail("Expected entries/list to succeed");
    }

    assert.equal(listed.entries.length, 1);

    const updated = await lifecycle.updateEntry(createResult.entry.id, {
        label: "Work Email",
        value: "work@example.com",
        favorite: false
    });
    assert.equal(updated.ok, true);
    if (!updated.ok) {
        assert.fail("Expected entries/update to succeed");
    }

    assert.equal(updated.entry.label, "Work Email");
    assert.equal(updated.entry.favorite, false);
    assert.equal(updated.entry.maskedPreview.endsWith(".com"), true);

    const envelope = await repository.readEnvelope();
    assert.ok(envelope);
    assert.equal(envelope?.meta.updatedAt, "2026-07-16T10:00:00.000Z");
});

test("vault lifecycle deletes entries while unlocked", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const created = await lifecycle.createEntry({
        label: "Primary Email",
        value: "demo@example.com",
        category: "identity"
    });

    assert.equal(created.ok, true);
    if (!created.ok) {
        assert.fail("Expected createEntry to succeed");
    }

    const deleted = await lifecycle.deleteEntry(created.entry.id);
    assert.deepEqual(deleted, { ok: true, deletedEntryId: created.entry.id });

    const listed = await lifecycle.listEntries();
    assert.equal(listed.ok, true);
    if (!listed.ok) {
        assert.fail("Expected listEntries to succeed");
    }

    assert.equal(listed.entries.length, 0);
});

test("vault lifecycle reorders entries while unlocked", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const first = await lifecycle.createEntry({
        label: "Entry One",
        value: "value-1",
        category: "identity"
    });
    const second = await lifecycle.createEntry({
        label: "Entry Two",
        value: "value-2",
        category: "identity"
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) {
        assert.fail("Expected createEntry calls to succeed");
    }

    const reordered = await lifecycle.reorderEntry(second.entry.id, 0);
    assert.equal(reordered.ok, true);

    const listed = await lifecycle.listEntries();
    assert.equal(listed.ok, true);
    if (!listed.ok) {
        assert.fail("Expected listEntries to succeed");
    }

    assert.equal(listed.entries[0]?.id, second.entry.id);
    assert.equal(listed.entries[1]?.id, first.entry.id);
});

test("vault lifecycle entry operations are blocked when vault is locked", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    await lifecycle.lockVault();

    const listResult = await lifecycle.listEntries();
    const createResult = await lifecycle.createEntry({
        label: "Primary Email",
        value: "demo@example.com",
        category: "identity"
    });
    const updateResult = await lifecycle.updateEntry("missing", { label: "Updated" });
    const deleteResult = await lifecycle.deleteEntry("missing");
    const reorderResult = await lifecycle.reorderEntry("missing", 0);

    assert.deepEqual(listResult, { ok: false, error: "ERR_VAULT_LOCKED" });
    assert.deepEqual(createResult, { ok: false, error: "ERR_VAULT_LOCKED" });
    assert.deepEqual(updateResult, { ok: false, error: "ERR_VAULT_LOCKED" });
    assert.deepEqual(deleteResult, { ok: false, error: "ERR_VAULT_LOCKED" });
    assert.deepEqual(reorderResult, { ok: false, error: "ERR_VAULT_LOCKED" });
});

test("vault lifecycle updateEntry returns not found for unknown entry ids", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const result = await lifecycle.updateEntry("missing-entry", { label: "Updated" });

    assert.deepEqual(result, { ok: false, error: "ERR_ENTRY_NOT_FOUND" });
});

test("vault lifecycle deleteEntry returns not found for unknown entry ids", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const result = await lifecycle.deleteEntry("missing-entry");

    assert.deepEqual(result, { ok: false, error: "ERR_ENTRY_NOT_FOUND" });
});

test("vault lifecycle reorderEntry returns not found for unknown entry ids", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const result = await lifecycle.reorderEntry("missing-entry", 0);

    assert.deepEqual(result, { ok: false, error: "ERR_ENTRY_NOT_FOUND" });
});

test("vault lifecycle keeps plaintext values out of persistent envelope storage", async () => {
    const store = createMemoryVaultRecordStore();
    const repository = createVaultRepository(store);
    const lifecycle = createVaultLifecycle({
        repository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase1-test"
    });

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    await lifecycle.createEntry({
        label: "PAN",
        value: "ABCDE1234F",
        category: "tax"
    });

    const envelope = await repository.readEnvelope();
    assert.ok(envelope);
    const serializedEnvelope = JSON.stringify(envelope);

    assert.equal(serializedEnvelope.includes("ABCDE1234F"), false);
    assert.equal(serializedEnvelope.includes("PAN"), false);
});

test("vault lifecycle wrong-password unlock does not mutate stored ciphertext", async () => {
    const store = createMemoryVaultRecordStore();
    const repository = createVaultRepository(store);
    const lifecycle = createVaultLifecycle({
        repository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase1-test"
    });

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    await lifecycle.lockVault();

    const before = await repository.readEnvelope();
    assert.ok(before);

    const unlockResult = await lifecycle.unlockVault("wrong password");
    assert.deepEqual(unlockResult, { ok: false, error: "ERR_UNLOCK_INVALID_PASSWORD" });

    const after = await repository.readEnvelope();
    assert.deepEqual(after, before);
});

test("vault lifecycle list remains usable with 500 masked entries", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    for (let index = 0; index < 500; index += 1) {
        const created = await lifecycle.createEntry({
            label: `Entry ${index}`,
            value: `value-${index}-sensitive`,
            category: index % 2 === 0 ? "identity" : "tax"
        });

        assert.equal(created.ok, true);
    }

    const listed = await lifecycle.listEntries();
    assert.equal(listed.ok, true);
    if (!listed.ok) {
        assert.fail("Expected listEntries to succeed");
    }

    assert.equal(listed.entries.length, 500);
    for (const entry of listed.entries) {
        assert.ok(entry.maskedPreview.length > 0);
        assert.notEqual(entry.maskedPreview, entry.value);
    }
});

test("vault lifecycle exports encrypted vault file without plaintext", async () => {
    const store = createMemoryVaultRecordStore();
    const repository = createVaultRepository(store);
    const lifecycle = createVaultLifecycle({
        repository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase4-export"
    });

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    await lifecycle.createEntry({
        label: "Passport",
        value: "P1234567",
        category: "identity"
    });

    const exported = await lifecycle.exportVaultFile();
    assert.equal(exported.ok, true);
    if (!exported.ok) {
        assert.fail("Expected export to succeed");
    }

    assert.equal(exported.file.formatVersion, 1);
    const serialized = JSON.stringify(exported.file);
    assert.equal(serialized.includes("P1234567"), false);
    assert.equal(serialized.includes("Passport"), false);
});

test("vault lifecycle import replace stores imported encrypted file", async () => {
    const sourceStore = createMemoryVaultRecordStore();
    const sourceRepository = createVaultRepository(sourceStore);
    const sourceLifecycle = createVaultLifecycle({
        repository: sourceRepository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase4-source"
    });

    await sourceLifecycle.initialize();
    await sourceLifecycle.createVault("correct horse battery staple");
    await sourceLifecycle.createEntry({
        label: "Primary Email",
        value: "demo@example.com",
        category: "identity"
    });

    const exported = await sourceLifecycle.exportVaultFile();
    assert.equal(exported.ok, true);
    if (!exported.ok) {
        assert.fail("Expected export to succeed");
    }

    const targetStore = createMemoryVaultRecordStore();
    const targetRepository = createVaultRepository(targetStore);
    const targetLifecycle = createVaultLifecycle({
        repository: targetRepository,
        now: () => "2026-07-16T11:00:00.000Z",
        createVaultId: () => "vault-phase4-target"
    });

    await targetLifecycle.initialize();
    const imported = await targetLifecycle.importVaultFile(exported.file, "correct horse battery staple", "replace");

    assert.deepEqual(imported, { ok: true, mode: "replace", entryCount: 1 });

    const unlockResult = await targetLifecycle.unlockVault("correct horse battery staple");
    assert.equal(unlockResult.ok, true);
    const listed = await targetLifecycle.listEntries();
    assert.equal(listed.ok, true);
    if (!listed.ok) {
        assert.fail("Expected listEntries to succeed");
    }

    assert.equal(listed.entries.length, 1);
    assert.equal(listed.entries[0]?.label, "Primary Email");
});

test("vault lifecycle import merge combines local and imported entries", async () => {
    const sourceStore = createMemoryVaultRecordStore();
    const sourceRepository = createVaultRepository(sourceStore);
    const sourceLifecycle = createVaultLifecycle({
        repository: sourceRepository,
        now: () => "2026-07-16T10:00:00.000Z",
        createVaultId: () => "vault-phase4-source"
    });

    await sourceLifecycle.initialize();
    await sourceLifecycle.createVault("correct horse battery staple");
    await sourceLifecycle.createEntry({
        label: "Imported Entry",
        value: "imported-value",
        category: "identity"
    });

    const exported = await sourceLifecycle.exportVaultFile();
    assert.equal(exported.ok, true);
    if (!exported.ok) {
        assert.fail("Expected export to succeed");
    }

    const targetStore = createMemoryVaultRecordStore();
    const targetRepository = createVaultRepository(targetStore);
    const targetLifecycle = createVaultLifecycle({
        repository: targetRepository,
        now: () => "2026-07-16T11:00:00.000Z",
        createVaultId: () => "vault-phase4-target"
    });

    await targetLifecycle.initialize();
    await targetLifecycle.createVault("correct horse battery staple");
    await targetLifecycle.createEntry({
        label: "Local Entry",
        value: "local-value",
        category: "identity"
    });
    await targetLifecycle.lockVault();

    const imported = await targetLifecycle.importVaultFile(exported.file, "correct horse battery staple", "merge");
    assert.equal(imported.ok, true);
    if (!imported.ok) {
        assert.fail("Expected merge import to succeed");
    }

    const unlockResult = await targetLifecycle.unlockVault("correct horse battery staple");
    assert.equal(unlockResult.ok, true);
    const listed = await targetLifecycle.listEntries();
    assert.equal(listed.ok, true);
    if (!listed.ok) {
        assert.fail("Expected listEntries to succeed");
    }

    assert.equal(listed.entries.length, 2);
    const labels = new Set(listed.entries.map((entry) => entry.label));
    assert.equal(labels.has("Imported Entry"), true);
    assert.equal(labels.has("Local Entry"), true);
});

test("vault lifecycle import rejects unsupported schema version", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    const exported = await lifecycle.exportVaultFile();
    assert.equal(exported.ok, true);
    if (!exported.ok) {
        assert.fail("Expected export to succeed");
    }

    const invalidFile = {
        ...exported.file,
        envelope: {
            ...exported.file.envelope,
            schemaVersion: 999 as 1
        }
    };

    const imported = await lifecycle.importVaultFile(invalidFile, "correct horse battery staple", "replace");
    assert.deepEqual(imported, { ok: false, error: "ERR_IMPORT_SCHEMA_UNSUPPORTED" });
});

test("vault lifecycle import rejects tampered encrypted payload", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");
    const exported = await lifecycle.exportVaultFile();
    assert.equal(exported.ok, true);
    if (!exported.ok) {
        assert.fail("Expected export to succeed");
    }

    const tamperedCiphertext = exported.file.envelope.ciphertext.slice(0, -1) + (exported.file.envelope.ciphertext.endsWith("A") ? "B" : "A");
    const tamperedFile = {
        ...exported.file,
        envelope: {
            ...exported.file.envelope,
            ciphertext: tamperedCiphertext
        }
    };

    const imported = await lifecycle.importVaultFile(tamperedFile, "correct horse battery staple", "replace");
    assert.deepEqual(imported, { ok: false, error: "ERR_UNLOCK_INVALID_PASSWORD" });
});
