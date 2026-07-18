import { createVaultEnvelope, openVaultEnvelope } from "@encrypted-id-vault/crypto";
import { VAULT_SCHEMA_VERSION, type VaultDocument, type VaultEntry, type VaultEnvelope, type VaultExportFile, type VaultPreferences } from "@encrypted-id-vault/shared";
import { createVaultDocument, createVaultRepository, type VaultRecordStore, type VaultRepository } from "@encrypted-id-vault/vault";

const VAULT_STORAGE_KEY = "vaultEnvelope";

export type VaultLifecycleError =
    | "ERR_UNLOCK_INVALID_PASSWORD"
    | "ERR_VAULT_ALREADY_EXISTS"
    | "ERR_VAULT_NOT_FOUND"
    | "ERR_VAULT_LOCKED"
    | "ERR_ENTRY_NOT_FOUND"
    | "ERR_IMPORT_SCHEMA_UNSUPPORTED"
    | "ERR_VAULT_CORRUPT";

export type EntryCreateInput = {
    label: string;
    value: string;
    category: string;
    notes?: string;
    favorite?: boolean;
    domainAllowlist?: string[];
    copyModeAllowed?: boolean;
    insertModeAllowed?: boolean;
};

export type EntryUpdateInput = {
    label?: string;
    value?: string;
    category?: string;
    notes?: string;
    favorite?: boolean;
    domainAllowlist?: string[];
    copyModeAllowed?: boolean;
    insertModeAllowed?: boolean;
};

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

export type VaultListEntriesResult =
    | {
        ok: true;
        entries: VaultEntry[];
    }
    | {
        ok: false;
        error: "ERR_VAULT_LOCKED";
    };

export type VaultCreateEntryResult =
    | {
        ok: true;
        entry: VaultEntry;
    }
    | {
        ok: false;
        error: "ERR_VAULT_LOCKED";
    };

export type VaultUpdateEntryResult =
    | {
        ok: true;
        entry: VaultEntry;
    }
    | {
        ok: false;
        error: "ERR_VAULT_LOCKED" | "ERR_ENTRY_NOT_FOUND";
    };

export type VaultDeleteEntryResult =
    | {
        ok: true;
        deletedEntryId: string;
    }
    | {
        ok: false;
        error: "ERR_VAULT_LOCKED" | "ERR_ENTRY_NOT_FOUND";
    };

export type VaultReorderEntryResult =
    | {
        ok: true;
        entry: VaultEntry;
    }
    | {
        ok: false;
        error: "ERR_VAULT_LOCKED" | "ERR_ENTRY_NOT_FOUND";
    };

export type VaultExportResult =
    | {
        ok: true;
        file: VaultExportFile;
    }
    | {
        ok: false;
        error: "ERR_VAULT_NOT_FOUND";
    };

export type VaultImportResult =
    | {
        ok: true;
        mode: "replace" | "merge";
        entryCount: number;
    }
    | {
        ok: false;
        error: "ERR_UNLOCK_INVALID_PASSWORD" | "ERR_IMPORT_SCHEMA_UNSUPPORTED" | "ERR_VAULT_CORRUPT";
    };

export interface VaultLifecycle {
    initialize(): Promise<{ hasVault: boolean; locked: boolean; lastUnlockedAt: string | null }>;
    getStatus(): { hasVault: boolean; locked: boolean; lastUnlockedAt: string | null; preferences: VaultPreferences | null };
    getAutoLockMinutes(): number | null;
    createVault(masterPassword: string): Promise<VaultLifecycleResult>;
    unlockVault(masterPassword: string): Promise<VaultLifecycleResult>;
    lockVault(): Promise<VaultLifecycleResult>;
    updatePreferences(preferences: Partial<VaultPreferences>): Promise<VaultLifecycleResult>;
    exportVaultFile(): Promise<VaultExportResult>;
    importVaultFile(file: VaultExportFile, masterPassword: string, mode: "replace" | "merge"): Promise<VaultImportResult>;
    listEntries(filters?: { query?: string; favoritesOnly?: boolean }): Promise<VaultListEntriesResult>;
    createEntry(entryInput: EntryCreateInput): Promise<VaultCreateEntryResult>;
    updateEntry(entryId: string, updates: EntryUpdateInput): Promise<VaultUpdateEntryResult>;
    deleteEntry(entryId: string): Promise<VaultDeleteEntryResult>;
    reorderEntry(entryId: string, targetIndex: number): Promise<VaultReorderEntryResult>;
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

    const createEntryId = () => crypto.randomUUID();

    const createMaskedPreview = (value: string): string => {
        if (value.length <= 4) {
            return "*".repeat(value.length);
        }

        const maskLength = Math.min(8, Math.max(4, value.length - 4));
        return `${"*".repeat(maskLength)}${value.slice(-4)}`;
    };

    const cloneEntries = (entries: VaultEntry[]): VaultEntry[] => entries.map((entry) => ({ ...entry }));

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

    const selectMostRecentEntry = (left: VaultEntry, right: VaultEntry): VaultEntry => {
        return left.updatedAt >= right.updatedAt ? left : right;
    };

    const mergeEntries = (localEntries: VaultEntry[], importedEntries: VaultEntry[]): VaultEntry[] => {
        const byId = new Map<string, VaultEntry>();

        for (const entry of localEntries) {
            byId.set(entry.id, { ...entry });
        }

        for (const entry of importedEntries) {
            const existing = byId.get(entry.id);
            if (!existing) {
                byId.set(entry.id, { ...entry });
                continue;
            }

            byId.set(entry.id, { ...selectMostRecentEntry(existing, entry) });
        }

        return [...byId.values()];
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
        },
        async exportVaultFile() {
            const envelope = await repository.readEnvelope();

            if (!envelope) {
                return { ok: false, error: "ERR_VAULT_NOT_FOUND" };
            }

            return {
                ok: true,
                file: {
                    formatVersion: 1,
                    exportedAt: now(),
                    envelope
                }
            };
        },
        async importVaultFile(file, masterPassword, mode) {
            if (file.formatVersion !== 1 || file.envelope.schemaVersion !== VAULT_SCHEMA_VERSION) {
                return { ok: false, error: "ERR_IMPORT_SCHEMA_UNSUPPORTED" };
            }

            const importedDocumentResult = await openVaultEnvelope(file.envelope, masterPassword);
            if (!importedDocumentResult.ok) {
                return { ok: false, error: "ERR_UNLOCK_INVALID_PASSWORD" };
            }

            const importedDocument = importedDocumentResult.value;

            if (!importedDocument || !Array.isArray(importedDocument.entries) || !importedDocument.preferences || !importedDocument.metadata) {
                return { ok: false, error: "ERR_VAULT_CORRUPT" };
            }

            if (mode === "replace") {
                await repository.saveEnvelope(file.envelope);
                hasVault = true;
                currentEnvelope = file.envelope;
                unlockedDocument = null;
                currentMasterPassword = null;
                lastUnlockedAt = file.envelope.meta.lastUnlockedAt ?? null;

                return { ok: true, mode, entryCount: importedDocument.entries.length };
            }

            const localEnvelope = await repository.readEnvelope();
            if (!localEnvelope) {
                await repository.saveEnvelope(file.envelope);
                hasVault = true;
                currentEnvelope = file.envelope;
                unlockedDocument = null;
                currentMasterPassword = null;
                lastUnlockedAt = file.envelope.meta.lastUnlockedAt ?? null;
                return { ok: true, mode, entryCount: importedDocument.entries.length };
            }

            const localDocumentResult = await openVaultEnvelope(localEnvelope, masterPassword);
            if (!localDocumentResult.ok) {
                return { ok: false, error: "ERR_UNLOCK_INVALID_PASSWORD" };
            }

            const localDocument = localDocumentResult.value;
            const mergedEntries = mergeEntries(localDocument.entries, importedDocument.entries);
            const mergedAt = now();
            const mergedDocument: VaultDocument = {
                ...localDocument,
                entries: mergedEntries,
                metadata: {
                    ...localDocument.metadata,
                    updatedAt: mergedAt
                }
            };

            const mergedEnvelope = await createVaultEnvelope(mergedDocument, masterPassword, localEnvelope.kdf);
            await repository.saveEnvelope(mergedEnvelope);

            hasVault = true;
            currentEnvelope = mergedEnvelope;
            unlockedDocument = null;
            currentMasterPassword = null;
            lastUnlockedAt = mergedEnvelope.meta.lastUnlockedAt ?? null;

            return { ok: true, mode, entryCount: mergedEntries.length };
        },
        async listEntries(filters = {}) {
            if (!unlockedDocument) {
                return { ok: false, error: "ERR_VAULT_LOCKED" };
            }

            const normalizedQuery = filters.query?.trim().toLowerCase();
            const entries = unlockedDocument.entries.filter((entry) => {
                if (filters.favoritesOnly && !entry.favorite) {
                    return false;
                }

                if (!normalizedQuery) {
                    return true;
                }

                return [entry.label, entry.category, entry.notes ?? ""].some((field) => field.toLowerCase().includes(normalizedQuery));
            });

            return { ok: true, entries: cloneEntries(entries) };
        },
        async createEntry(entryInput) {
            if (!unlockedDocument) {
                return { ok: false, error: "ERR_VAULT_LOCKED" };
            }

            const timestamp = now();
            const nextEntry: VaultEntry = {
                id: createEntryId(),
                label: entryInput.label,
                value: entryInput.value,
                category: entryInput.category,
                notes: entryInput.notes,
                maskedPreview: createMaskedPreview(entryInput.value),
                favorite: entryInput.favorite ?? false,
                createdAt: timestamp,
                updatedAt: timestamp,
                domainAllowlist: entryInput.domainAllowlist,
                copyModeAllowed: entryInput.copyModeAllowed ?? true,
                insertModeAllowed: entryInput.insertModeAllowed ?? true
            };

            unlockedDocument.entries = [...unlockedDocument.entries, nextEntry];
            unlockedDocument.metadata.updatedAt = timestamp;
            await persistUnlockedDocument();

            return { ok: true, entry: { ...nextEntry } };
        },
        async updateEntry(entryId, updates) {
            if (!unlockedDocument) {
                return { ok: false, error: "ERR_VAULT_LOCKED" };
            }

            const currentEntry = unlockedDocument.entries.find((entry) => entry.id === entryId);
            if (!currentEntry) {
                return { ok: false, error: "ERR_ENTRY_NOT_FOUND" };
            }

            const timestamp = now();
            const nextValue = updates.value ?? currentEntry.value;
            const updatedEntry: VaultEntry = {
                ...currentEntry,
                ...updates,
                value: nextValue,
                maskedPreview: createMaskedPreview(nextValue),
                updatedAt: timestamp
            };

            unlockedDocument.entries = unlockedDocument.entries.map((entry) => (entry.id === entryId ? updatedEntry : entry));
            unlockedDocument.metadata.updatedAt = timestamp;
            await persistUnlockedDocument();

            return { ok: true, entry: { ...updatedEntry } };
        },
        async deleteEntry(entryId) {
            if (!unlockedDocument) {
                return { ok: false, error: "ERR_VAULT_LOCKED" };
            }

            const hasEntry = unlockedDocument.entries.some((entry) => entry.id === entryId);
            if (!hasEntry) {
                return { ok: false, error: "ERR_ENTRY_NOT_FOUND" };
            }

            const timestamp = now();
            unlockedDocument.entries = unlockedDocument.entries.filter((entry) => entry.id !== entryId);
            unlockedDocument.metadata.updatedAt = timestamp;
            await persistUnlockedDocument();

            return { ok: true, deletedEntryId: entryId };
        },
        async reorderEntry(entryId, targetIndex) {
            if (!unlockedDocument) {
                return { ok: false, error: "ERR_VAULT_LOCKED" };
            }

            const currentIndex = unlockedDocument.entries.findIndex((entry) => entry.id === entryId);
            if (currentIndex < 0) {
                return { ok: false, error: "ERR_ENTRY_NOT_FOUND" };
            }

            const boundedTargetIndex = Math.max(0, Math.min(targetIndex, unlockedDocument.entries.length - 1));
            if (boundedTargetIndex === currentIndex) {
                return { ok: true, entry: { ...unlockedDocument.entries[currentIndex] } };
            }

            const timestamp = now();
            const entries = [...unlockedDocument.entries];
            const [movedEntry] = entries.splice(currentIndex, 1);
            entries.splice(boundedTargetIndex, 0, {
                ...movedEntry,
                updatedAt: timestamp
            });

            unlockedDocument.entries = entries;
            unlockedDocument.metadata.updatedAt = timestamp;
            await persistUnlockedDocument();

            const updatedEntry = unlockedDocument.entries.find((entry) => entry.id === entryId);
            if (!updatedEntry) {
                return { ok: false, error: "ERR_ENTRY_NOT_FOUND" };
            }

            return { ok: true, entry: { ...updatedEntry } };
        }
    };
}
