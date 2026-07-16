import type { VaultDocument, VaultEnvelope, VaultEntry, VaultMetadata, VaultPreferences } from "@encrypted-id-vault/shared";
import { VAULT_SCHEMA_VERSION } from "@encrypted-id-vault/shared";

import { isVaultEnvelope } from "@encrypted-id-vault/crypto";

export interface VaultRecordStore {
    load(): Promise<VaultEnvelope | null>;
    save(envelope: VaultEnvelope): Promise<void>;
    clear(): Promise<void>;
}

export interface VaultRepository {
    hasVault(): Promise<boolean>;
    readEnvelope(): Promise<VaultEnvelope | null>;
    saveEnvelope(envelope: VaultEnvelope): Promise<void>;
    clear(): Promise<void>;
}

export function createDefaultVaultPreferences(): VaultPreferences {
    return {
        autoLockMinutes: 5,
        defaultInsertMode: "insert",
        clipboardWarningEnabled: true,
        theme: "system",
        telemetryEnabled: false
    };
}

export function createVaultMetadata(timestamp = new Date().toISOString(), lastUnlockedAt?: string): VaultMetadata {
    return {
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUnlockedAt,
        syncProvider: null
    };
}

export function createVaultDocument(vaultId: string, entries: VaultEntry[] = [], timestamp = new Date().toISOString()): VaultDocument {
    return {
        schemaVersion: VAULT_SCHEMA_VERSION,
        vaultId,
        entries,
        preferences: createDefaultVaultPreferences(),
        metadata: createVaultMetadata(timestamp)
    };
}

export function createMemoryVaultRecordStore(initialEnvelope: VaultEnvelope | null = null): VaultRecordStore {
    let envelope = initialEnvelope;

    return {
        async load() {
            return envelope;
        },
        async save(nextEnvelope) {
            envelope = nextEnvelope;
        },
        async clear() {
            envelope = null;
        }
    };
}

export function createVaultRepository(store: VaultRecordStore = createMemoryVaultRecordStore()): VaultRepository {
    return {
        async hasVault() {
            return (await store.load()) !== null;
        },
        async readEnvelope() {
            const envelope = await store.load();
            return envelope && isVaultEnvelope(envelope) ? envelope : null;
        },
        async saveEnvelope(envelope) {
            if (!isVaultEnvelope(envelope)) {
                throw new Error("Invalid vault envelope");
            }

            await store.save(envelope);
        },
        async clear() {
            await store.clear();
        }
    };
}
