import type { VaultExportFile } from "./vault";

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

export interface ExportVaultPayload {
    readonly [key: string]: never;
}

export interface ImportVaultPayload {
    file: VaultExportFile;
    masterPassword: string;
    mode: "replace" | "merge";
}

export interface ListEntriesPayload {
    query?: string;
    favoritesOnly?: boolean;
}

export interface CreateEntryPayload {
    label: string;
    value: string;
    category: string;
    notes?: string;
    favorite?: boolean;
    domainAllowlist?: string[];
    copyModeAllowed?: boolean;
    insertModeAllowed?: boolean;
}

export interface UpdateEntryPayload {
    entryId: string;
    label?: string;
    value?: string;
    category?: string;
    notes?: string;
    favorite?: boolean;
    domainAllowlist?: string[];
    copyModeAllowed?: boolean;
    insertModeAllowed?: boolean;
}

export interface DeleteEntryPayload {
    entryId: string;
}

export interface ReorderEntryPayload {
    entryId: string;
    targetIndex: number;
}

export interface InsertEntryPayload {
    entryId: string;
    fallbackToClipboard?: boolean;
}

export interface InsertTargetPayload {
    entryId: string;
    value: string;
    domainAllowlist?: string[];
    fallbackToClipboard?: boolean;
    frameId?: number;
}

export interface SyncProviderPayload {
    provider: "drive" | "dropbox";
}

export type BillingPlan = "pro-monthly" | "pro-yearly" | "lifetime";

export type EntitlementTier = "free" | "pro" | "lifetime";

export type EntitlementState = "active" | "grace" | "expired" | "unknown";

export interface BillingLinkAccountPayload {
    email: string;
}

export interface BillingStartCheckoutPayload {
    plan: BillingPlan;
}

export interface BillingGetEntitlementPayload {
    forceRefresh?: boolean;
}

export interface SyncSetProviderPayload {
    provider: "drive" | "dropbox" | null;
}

export interface SyncRequestPayload {
    action: "push" | "pull";
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
export type VaultExportMessage = MessageEnvelope<"vault/export", ExportVaultPayload>;
export type VaultImportMessage = MessageEnvelope<"vault/import", ImportVaultPayload>;
export type VaultUpdatePreferencesMessage = MessageEnvelope<"vault/updatePreferences", VaultPreferencesUpdatePayload>;
export type EntriesListMessage = MessageEnvelope<"entries/list", ListEntriesPayload>;
export type EntriesCreateMessage = MessageEnvelope<"entries/create", CreateEntryPayload>;
export type EntriesUpdateMessage = MessageEnvelope<"entries/update", UpdateEntryPayload>;
export type EntriesDeleteMessage = MessageEnvelope<"entries/delete", DeleteEntryPayload>;
export type EntriesReorderMessage = MessageEnvelope<"entries/reorder", ReorderEntryPayload>;
export type EntriesInsertMessage = MessageEnvelope<"entries/insert", InsertEntryPayload>;
export type InsertTargetMessage = MessageEnvelope<"insert/target", InsertTargetPayload>;
export type SyncConnectProviderMessage = MessageEnvelope<"sync/connectProvider", SyncProviderPayload>;
export type BillingLinkAccountMessage = MessageEnvelope<"billing/linkAccount", BillingLinkAccountPayload>;
export type BillingStartCheckoutMessage = MessageEnvelope<"billing/startCheckout", BillingStartCheckoutPayload>;
export type BillingGetEntitlementMessage = MessageEnvelope<"billing/getEntitlement", BillingGetEntitlementPayload>;
export type SyncSetProviderMessage = MessageEnvelope<"sync/setProvider", SyncSetProviderPayload>;
export type SyncRequestMessage = MessageEnvelope<"sync/request", SyncRequestPayload>;

export type BackgroundMessage =
    | VaultGetStatusMessage
    | VaultCreateMessage
    | VaultUnlockMessage
    | VaultLockMessage
    | VaultExportMessage
    | VaultImportMessage
    | VaultUpdatePreferencesMessage
    | EntriesListMessage
    | EntriesCreateMessage
    | EntriesUpdateMessage
    | EntriesDeleteMessage
    | EntriesReorderMessage
    | EntriesInsertMessage
    | BillingLinkAccountMessage
    | BillingStartCheckoutMessage
    | BillingGetEntitlementMessage
    | SyncSetProviderMessage
    | SyncRequestMessage
    | InsertTargetMessage
    | SyncConnectProviderMessage;
