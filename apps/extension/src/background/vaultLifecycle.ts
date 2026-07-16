import { createVaultEnvelope, openVaultEnvelope } from "@encrypted-id-vault/crypto";
import type { VaultDocument, VaultEnvelope } from "@encrypted-id-vault/shared";
import { createVaultDocument, createVaultRepository, type VaultRecordStore, type VaultRepository } from "@encrypted-id-vault/vault";

const VAULT_STORAGE_KEY = "vaultEnvelope";

export type VaultLifecycleError = "ERR_UNLOCK_INVALID_PASSWORD" | "ERR_VAULT_ALREADY_EXISTS" | "ERR_VAULT_NOT_FOUND";

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
    initialize(): Promise<{ hasVault: boolean; locked: boolean }>;
    getStatus(): { hasVault: boolean; locked: boolean };
    getAutoLockMinutes(): number | null;
    createVault(masterPassword: string): Promise<VaultLifecycleResult>;
    unlockVault(masterPassword: string): Promise<VaultLifecycleResult>;
    lockVault(): Promise<VaultLifecycleResult>;
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

    const lockInternal = async (): Promise<VaultLifecycleResult> => {
        unlockedDocument = null;
        return { ok: true, hasVault, locked: true };
    };

    return {
        async initialize() {
            hasVault = await repository.hasVault();
            unlockedDocument = null;
            return { hasVault, locked: true };
        },
        getStatus() {
            return {
                hasVault,
                locked: unlockedDocument === null
            };
        },
        getAutoLockMinutes() {
            return unlockedDocument?.preferences.autoLockMinutes ?? null;
        },
        async createVault(masterPassword) {
            if (hasVault) {
                return { ok: false, error: "ERR_VAULT_ALREADY_EXISTS" };
            }

            const document = createVaultDocument(createVaultId(), [], now());
            const envelope = await createVaultEnvelope(document, masterPassword);

            await repository.saveEnvelope(envelope);
            hasVault = true;
            unlockedDocument = document;

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

            hasVault = true;
            unlockedDocument = result.value;
            return { ok: true, hasVault: true, locked: false };
        },
        async lockVault() {
            return lockInternal();
        }
    };
}
