export const VAULT_SCHEMA_VERSION = 1 as const;

export type VaultSchemaVersion = typeof VAULT_SCHEMA_VERSION;

export type SyncProvider = "drive" | "dropbox" | null;

export interface VaultEntry {
    id: string;
    label: string;
    value: string;
    category: string;
    notes?: string;
    maskedPreview: string;
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    domainAllowlist?: string[];
    copyModeAllowed: boolean;
    insertModeAllowed: boolean;
}

export interface VaultPreferences {
    autoLockMinutes: number;
    defaultInsertMode: "insert" | "copy";
    clipboardWarningEnabled: boolean;
    theme: "system" | "light" | "dark";
    telemetryEnabled: boolean;
}

export interface KdfParameters {
    name: "argon2id" | "pbkdf2";
    salt: string;
    iterations?: number;
    memory?: number;
    parallelism?: number;
}

export interface EncryptionParameters {
    algorithm: "AES-GCM";
    nonce: string;
}

export interface IntegrityParameters {
    method: "aes-gcm-tag" | "hmac";
    value: string;
}

export interface VaultMetadata {
    createdAt: string;
    updatedAt: string;
    lastUnlockedAt?: string;
    lastSyncedAt?: string;
    syncProvider: SyncProvider;
}

export interface SyncMetadata {
    provider: Exclude<SyncProvider, null>;
    remoteFileId?: string;
    remoteRevision?: string;
    lastKnownHash?: string;
    lastSyncDeviceId?: string;
    lastSyncedAt?: string;
}

export interface VaultDocument {
    schemaVersion: VaultSchemaVersion;
    vaultId: string;
    entries: VaultEntry[];
    preferences: VaultPreferences;
    metadata: VaultMetadata;
    sync?: SyncMetadata;
}

export interface VaultEnvelope {
    schemaVersion: VaultSchemaVersion;
    vaultId: string;
    kdf: KdfParameters;
    encryption: EncryptionParameters;
    ciphertext: string;
    integrity: IntegrityParameters;
    meta: VaultMetadata;
}
