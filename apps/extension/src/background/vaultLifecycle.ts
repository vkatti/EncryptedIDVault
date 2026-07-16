import { createVaultEnvelope, openVaultEnvelope } from "@encrypted-id-vault/crypto";
import type { VaultDocument, VaultEnvelope } from "@encrypted-id-vault/shared";
import { createVaultDocument, createVaultRepository, type VaultRecordStore, type VaultRepository } from "@encrypted-id-vault/vault";

const VAULT_STORAGE_KEY = "vaultEnvelope";

type TimerRef = ReturnType<typeof setTimeout>;

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
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
}): VaultLifecycle {
    const repository = options?.repository ?? createVaultRepository(createChromeVaultRecordStore());
    const now = options?.now ?? (() => new Date().toISOString());
    const createVaultId = options?.createVaultId ?? (() => crypto.randomUUID());
    const setTimerFn = options?.setTimer ?? setTimeout;
    const clearTimerFn = options?.clearTimer ?? clearTimeout;

    let hasVault = false;
    let unlockedDocument: VaultDocument | null = null;
    let autoLockTimer: TimerRef | null = null;

    const clearAutoLockTimer = () => {
        if (autoLockTimer !== null) {
            clearTimerFn(autoLockTimer);
            autoLockTimer = null;
        }
    };

    const scheduleAutoLock = () => {
        clearAutoLockTimer();

        const minutes = unlockedDocument?.preferences.autoLockMinutes ?? 5;

        if (minutes <= 0) {
            return;
        }

        autoLockTimer = setTimerFn(() => {
            void lockInternal();
        }, minutes * 60 * 1000) as TimerRef;
    };

    const lockInternal = async (): Promise<VaultLifecycleResult> => {
        clearAutoLockTimer();
        unlockedDocument = null;
        return { ok: true, hasVault, locked: true };
    };

    return {
        async initialize() {
            hasVault = await repository.hasVault();
            unlockedDocument = null;
            clearAutoLockTimer();
            return { hasVault, locked: true };
        },
        getStatus() {
            return {
                hasVault,
                locked: unlockedDocument === null
            };
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
            scheduleAutoLock();

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
            scheduleAutoLock();
            return { ok: true, hasVault: true, locked: false };
        },
        async lockVault() {
            return lockInternal();
        }
    };
}
