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

    assert.deepEqual(listResult, { ok: false, error: "ERR_VAULT_LOCKED" });
    assert.deepEqual(createResult, { ok: false, error: "ERR_VAULT_LOCKED" });
    assert.deepEqual(updateResult, { ok: false, error: "ERR_VAULT_LOCKED" });
});

test("vault lifecycle updateEntry returns not found for unknown entry ids", async () => {
    const lifecycle = createLifecycle();

    await lifecycle.initialize();
    await lifecycle.createVault("correct horse battery staple");

    const result = await lifecycle.updateEntry("missing-entry", { label: "Updated" });

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
