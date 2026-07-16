export type MessageTarget = "background" | "popup" | "options" | "content-script";

export interface MessageEnvelope<TType extends string, TPayload> {
    id: string;
    type: TType;
    source: MessageTarget;
    target: MessageTarget;
    payload: TPayload;
}

export interface EmptyPayload {
    readonly [key: string]: never;
}

export interface VaultStatusPayload {
    locked: boolean;
    hasVault: boolean;
    lastUnlockedAt?: string;
}

export interface UnlockVaultPayload {
    masterPassword: string;
}

export interface CreateVaultPayload {
    masterPassword: string;
}

export interface LockVaultPayload {
    reason: "manual" | "timeout" | "restart";
}

export interface ListEntriesPayload {
    query?: string;
    favoritesOnly?: boolean;
}

export interface InsertEntryPayload {
    entryId: string;
    fallbackToClipboard?: boolean;
}

export interface InsertTargetPayload {
    tabId: number;
    frameId?: number;
}

export interface SyncProviderPayload {
    provider: "drive" | "dropbox";
}

export interface VaultPreferencesUpdatePayload {
    autoLockMinutes?: number;
    defaultInsertMode?: "insert" | "copy";
    clipboardWarningEnabled?: boolean;
    theme?: "system" | "light" | "dark";
    telemetryEnabled?: boolean;
}

export type VaultGetStatusMessage = MessageEnvelope<"vault/getStatus", EmptyPayload>;
export type VaultCreateMessage = MessageEnvelope<"vault/create", CreateVaultPayload>;
export type VaultUnlockMessage = MessageEnvelope<"vault/unlock", UnlockVaultPayload>;
export type VaultLockMessage = MessageEnvelope<"vault/lock", LockVaultPayload>;
export type VaultUpdatePreferencesMessage = MessageEnvelope<"vault/updatePreferences", VaultPreferencesUpdatePayload>;
export type EntriesListMessage = MessageEnvelope<"entries/list", ListEntriesPayload>;
export type EntriesInsertMessage = MessageEnvelope<"entries/insert", InsertEntryPayload>;
export type InsertTargetMessage = MessageEnvelope<"insert/target", InsertTargetPayload>;
export type SyncConnectProviderMessage = MessageEnvelope<"sync/connectProvider", SyncProviderPayload>;

export type BackgroundMessage =
    | VaultGetStatusMessage
    | VaultCreateMessage
    | VaultUnlockMessage
    | VaultLockMessage
    | VaultUpdatePreferencesMessage
    | EntriesListMessage
    | EntriesInsertMessage
    | InsertTargetMessage
    | SyncConnectProviderMessage;
