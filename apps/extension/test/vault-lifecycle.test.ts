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
    assert.deepEqual(initialized, { hasVault: false, locked: true });

    const createResult = await lifecycle.createVault("correct horse battery staple");
    assert.equal(createResult.ok, true);

    const status = lifecycle.getStatus();
    assert.equal(status.hasVault, true);
    assert.equal(status.locked, false);
    assert.equal(lifecycle.getAutoLockMinutes(), 5);
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

    const afterInitialize = await lifecycle.initialize();
    assert.deepEqual(afterInitialize, { hasVault: true, locked: true });
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
