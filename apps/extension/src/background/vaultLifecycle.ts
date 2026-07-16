import { createVaultEnvelope, openVaultEnvelope } from "@encrypted-id-vault/crypto";
import type { VaultDocument, VaultEnvelope, VaultPreferences } from "@encrypted-id-vault/shared";
import { createVaultDocument, createVaultRepository, type VaultRecordStore, type VaultRepository } from "@encrypted-id-vault/vault";

const VAULT_STORAGE_KEY = "vaultEnvelope";

export type VaultLifecycleError = "ERR_UNLOCK_INVALID_PASSWORD" | "ERR_VAULT_ALREADY_EXISTS" | "ERR_VAULT_NOT_FOUND" | "ERR_VAULT_LOCKED";

export type VaultLifecycleResult =
    | {
        ok: true;
        hasVault: boolean;
        locked: boolean;
    }
    | {
        ok: false;
        error: VaultLifecycleError;
    };

export interface VaultLifecycle {
    initialize(): Promise<{ hasVault: boolean; locked: boolean; lastUnlockedAt: string | null }>;
    getStatus(): { hasVault: boolean; locked: boolean; lastUnlockedAt: string | null; preferences: VaultPreferences | null };
    getAutoLockMinutes(): number | null;
    createVault(masterPassword: string): Promise<VaultLifecycleResult>;
    unlockVault(masterPassword: string): Promise<VaultLifecycleResult>;
    lockVault(): Promise<VaultLifecycleResult>;
    updatePreferences(preferences: Partial<VaultPreferences>): Promise<VaultLifecycleResult>;
}

export function createChromeVaultRecordStore(storage: chrome.storage.StorageArea = chrome.storage.local): VaultRecordStore {
    return {
        async load() {
            const result = await storage.get([VAULT_STORAGE_KEY]);
            const value = result[VAULT_STORAGE_KEY];
            return value && typeof value === "object" ? (value as VaultEnvelope) : null;
        },
        async save(envelope) {
            await storage.set({ [VAULT_STORAGE_KEY]: envelope });
        },
        async clear() {
            await storage.remove(VAULT_STORAGE_KEY);
        }
    };
}

export function createVaultLifecycle(options?: {
    repository?: VaultRepository;
    now?: () => string;
    createVaultId?: () => string;
}): VaultLifecycle {
    const repository = options?.repository ?? createVaultRepository(createChromeVaultRecordStore());
    const now = options?.now ?? (() => new Date().toISOString());
    const createVaultId = options?.createVaultId ?? (() => crypto.randomUUID());

    let hasVault = false;
    let unlockedDocument: VaultDocument | null = null;
    let lastUnlockedAt: string | null = null;
    let currentEnvelope: VaultEnvelope | null = null;
    let currentMasterPassword: string | null = null;

    const persistUnlockedDocument = async (): Promise<void> => {
        if (!unlockedDocument || !currentMasterPassword || !currentEnvelope) {
            return;
        }

        const envelope = await createVaultEnvelope(unlockedDocument, currentMasterPassword, currentEnvelope.kdf);
        await repository.saveEnvelope(envelope);
        currentEnvelope = envelope;
    };

    const lockInternal = async (): Promise<VaultLifecycleResult> => {
        unlockedDocument = null;
        currentMasterPassword = null;
        return { ok: true, hasVault, locked: true };
    };

    return {
        async initialize() {
            const envelope = await repository.readEnvelope();

            hasVault = envelope !== null;
            unlockedDocument = null;
            currentEnvelope = envelope;
            currentMasterPassword = null;
            lastUnlockedAt = envelope?.meta.lastUnlockedAt ?? null;
            return { hasVault, locked: true, lastUnlockedAt };
        },
        getStatus() {
            return {
                hasVault,
                locked: unlockedDocument === null,
                lastUnlockedAt,
                preferences: unlockedDocument ? unlockedDocument.preferences : null
            };
        },
        getAutoLockMinutes() {
            return unlockedDocument?.preferences.autoLockMinutes ?? null;
        },
        async createVault(masterPassword) {
            if (hasVault) {
                return { ok: false, error: "ERR_VAULT_ALREADY_EXISTS" };
            }

            const unlockedAt = now();
            const document = createVaultDocument(createVaultId(), [], unlockedAt);
            document.metadata.lastUnlockedAt = unlockedAt;
            const envelope = await createVaultEnvelope(document, masterPassword);

            await repository.saveEnvelope(envelope);
            hasVault = true;
            unlockedDocument = document;
            currentEnvelope = envelope;
            currentMasterPassword = masterPassword;
            lastUnlockedAt = unlockedAt;

            return { ok: true, hasVault: true, locked: false };
        },
        async unlockVault(masterPassword) {
            const envelope = await repository.readEnvelope();

            if (!envelope) {
                hasVault = false;
                return { ok: false, error: "ERR_VAULT_NOT_FOUND" };
            }

            const result = await openVaultEnvelope(envelope, masterPassword);

            if (!result.ok) {
                hasVault = true;
                return { ok: false, error: "ERR_UNLOCK_INVALID_PASSWORD" };
            }

            const unlockedAt = now();
            hasVault = true;
            unlockedDocument = result.value;
            currentEnvelope = envelope;
            currentMasterPassword = masterPassword;
            unlockedDocument.metadata.updatedAt = unlockedAt;
            unlockedDocument.metadata.lastUnlockedAt = unlockedAt;
            await persistUnlockedDocument();
            lastUnlockedAt = unlockedAt;
            return { ok: true, hasVault: true, locked: false };
        },
        async lockVault() {
            return lockInternal();
        },
        async updatePreferences(preferences) {
            if (!unlockedDocument) {
                return { ok: false, error: "ERR_VAULT_LOCKED" };
            }

            unlockedDocument.preferences = {
                ...unlockedDocument.preferences,
                ...preferences
            };
            unlockedDocument.metadata.updatedAt = now();
            await persistUnlockedDocument();

            return { ok: true, hasVault: true, locked: false };
        }
    };
}
