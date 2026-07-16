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

export type VaultGetStatusMessage = MessageEnvelope<"vault/getStatus", EmptyPayload>;
export type VaultUnlockMessage = MessageEnvelope<"vault/unlock", UnlockVaultPayload>;
export type VaultLockMessage = MessageEnvelope<"vault/lock", LockVaultPayload>;
export type EntriesListMessage = MessageEnvelope<"entries/list", ListEntriesPayload>;
export type EntriesInsertMessage = MessageEnvelope<"entries/insert", InsertEntryPayload>;
export type InsertTargetMessage = MessageEnvelope<"insert/target", InsertTargetPayload>;
export type SyncConnectProviderMessage = MessageEnvelope<"sync/connectProvider", SyncProviderPayload>;

export type BackgroundMessage =
  | VaultGetStatusMessage
  | VaultUnlockMessage
  | VaultLockMessage
  | EntriesListMessage
  | EntriesInsertMessage
  | InsertTargetMessage
  | SyncConnectProviderMessage;
