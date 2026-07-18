import type {
    BillingGetEntitlementMessage,
    BillingLinkAccountMessage,
    BillingStartCheckoutMessage,
    CreateEntryPayload,
    ErrorCode,
    ListEntriesPayload,
    MessageEnvelope,
    MessageTarget,
    InsertEntryPayload,
    InsertTargetMessage,
    VaultExportFile,
    UpdateEntryPayload,
    EntriesCreateMessage,
    EntriesDeleteMessage,
    EntriesListMessage,
    EntriesInsertMessage,
    EntriesReorderMessage,
    EntriesUpdateMessage,
    VaultCreateMessage,
    VaultExportMessage,
    VaultGetStatusMessage,
    VaultImportMessage,
    VaultLockMessage,
    VaultUpdatePreferencesMessage,
    VaultUnlockMessage,
    SyncSetProviderMessage,
    SyncRequestMessage
} from "@encrypted-id-vault/shared";

import { ERROR_CODES } from "@encrypted-id-vault/shared";

export type { ErrorCode } from "@encrypted-id-vault/shared";

const MESSAGE_TARGETS: readonly MessageTarget[] = ["background", "popup", "options", "content-script"] as const;
const LOCK_REASONS = ["manual", "timeout", "restart"] as const;
const PREFERENCE_KEYS = ["autoLockMinutes", "defaultInsertMode", "clipboardWarningEnabled", "theme", "telemetryEnabled"] as const;
const ENTRY_CREATE_KEYS = ["label", "value", "category", "notes", "favorite", "domainAllowlist", "copyModeAllowed", "insertModeAllowed"] as const;
const ENTRY_UPDATE_KEYS = ["entryId", "label", "value", "category", "notes", "favorite", "domainAllowlist", "copyModeAllowed", "insertModeAllowed"] as const;
const ENTRY_LIST_KEYS = ["query", "favoritesOnly"] as const;
const ENTRY_DELETE_KEYS = ["entryId"] as const;
const ENTRY_REORDER_KEYS = ["entryId", "targetIndex"] as const;
const ENTRY_INSERT_KEYS = ["entryId", "fallbackToClipboard"] as const;
const INSERT_TARGET_KEYS = ["entryId", "value", "domainAllowlist", "fallbackToClipboard", "frameId"] as const;
const BILLING_LINK_ACCOUNT_KEYS = ["email"] as const;
const BILLING_START_CHECKOUT_KEYS = ["plan"] as const;
const BILLING_GET_ENTITLEMENT_KEYS = ["forceRefresh"] as const;
const SYNC_SET_PROVIDER_KEYS = ["provider"] as const;
const SYNC_REQUEST_KEYS = ["action"] as const;

type RoutedBackgroundMessage =
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
    | SyncRequestMessage;

function isVaultExportFile(value: unknown): value is VaultExportFile {
    if (!isRecord(value)) {
        return false;
    }

    if (value.formatVersion !== 1 || !isNonEmptyString(value.exportedAt) || !isRecord(value.envelope)) {
        return false;
    }

    const envelope = value.envelope;
    return (
        envelope.schemaVersion === 1 &&
        isNonEmptyString(envelope.vaultId) &&
        isRecord(envelope.kdf) &&
        isNonEmptyString(envelope.kdf.salt) &&
        isRecord(envelope.encryption) &&
        isNonEmptyString(envelope.encryption.nonce) &&
        isRecord(envelope.integrity) &&
        isNonEmptyString(envelope.integrity.value) &&
        isNonEmptyString(envelope.ciphertext) &&
        isRecord(envelope.meta)
    );
}

export function isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function isMessageTarget(value: unknown): value is MessageTarget {
    return typeof value === "string" && MESSAGE_TARGETS.includes(value as MessageTarget);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function isMessageEnvelope(value: unknown): value is MessageEnvelope<string, unknown> {
    return (
        isRecord(value) &&
        isNonEmptyString(value.id) &&
        isNonEmptyString(value.type) &&
        isMessageTarget(value.source) &&
        isMessageTarget(value.target) &&
        "payload" in value
    );
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
    const presentKeys = Object.keys(record);
    return presentKeys.length === keys.length && presentKeys.every((key) => keys.includes(key));
}

function isBackgroundRoutedEnvelope(value: unknown): value is MessageEnvelope<string, unknown> {
    return isMessageEnvelope(value) && value.source === "popup" && value.target === "background";
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
    return value === undefined || typeof value === "boolean";
}

function isOptionalNumber(value: unknown): value is number | undefined {
    return value === undefined || typeof value === "number";
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
    return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isCreateEntryPayload(payload: unknown): payload is CreateEntryPayload {
    if (!isRecord(payload)) {
        return false;
    }

    if (!Object.keys(payload).every((key) => (ENTRY_CREATE_KEYS as readonly string[]).includes(key))) {
        return false;
    }

    return (
        isNonEmptyString(payload.label) &&
        isNonEmptyString(payload.value) &&
        isNonEmptyString(payload.category) &&
        isOptionalString(payload.notes) &&
        isOptionalBoolean(payload.favorite) &&
        isOptionalStringArray(payload.domainAllowlist) &&
        isOptionalBoolean(payload.copyModeAllowed) &&
        isOptionalBoolean(payload.insertModeAllowed)
    );
}

function isUpdateEntryPayload(payload: unknown): payload is UpdateEntryPayload {
    if (!isRecord(payload)) {
        return false;
    }

    if (!Object.keys(payload).every((key) => (ENTRY_UPDATE_KEYS as readonly string[]).includes(key))) {
        return false;
    }

    if (!isNonEmptyString(payload.entryId)) {
        return false;
    }

    const hasUpdates = Object.keys(payload).some((key) => key !== "entryId");
    if (!hasUpdates) {
        return false;
    }

    return (
        isOptionalString(payload.label) &&
        isOptionalString(payload.value) &&
        isOptionalString(payload.category) &&
        isOptionalString(payload.notes) &&
        isOptionalBoolean(payload.favorite) &&
        isOptionalStringArray(payload.domainAllowlist) &&
        isOptionalBoolean(payload.copyModeAllowed) &&
        isOptionalBoolean(payload.insertModeAllowed)
    );
}

function isListEntriesPayload(payload: unknown): payload is ListEntriesPayload {
    if (!isRecord(payload)) {
        return false;
    }

    if (!Object.keys(payload).every((key) => (ENTRY_LIST_KEYS as readonly string[]).includes(key))) {
        return false;
    }

    return isOptionalString(payload.query) && isOptionalBoolean(payload.favoritesOnly);
}

function isDeleteEntryPayload(payload: unknown): payload is { entryId: string } {
    if (!isRecord(payload)) {
        return false;
    }

    return hasOnlyKeys(payload, ENTRY_DELETE_KEYS) && isNonEmptyString(payload.entryId);
}

function isReorderEntryPayload(payload: unknown): payload is { entryId: string; targetIndex: number } {
    if (!isRecord(payload)) {
        return false;
    }

    return (
        hasOnlyKeys(payload, ENTRY_REORDER_KEYS) &&
        isNonEmptyString(payload.entryId) &&
        typeof payload.targetIndex === "number" &&
        Number.isInteger(payload.targetIndex) &&
        payload.targetIndex >= 0
    );
}

function isInsertEntryPayload(payload: unknown): payload is InsertEntryPayload {
    if (!isRecord(payload)) {
        return false;
    }

    if (!Object.keys(payload).every((key) => (ENTRY_INSERT_KEYS as readonly string[]).includes(key))) {
        return false;
    }

    return isNonEmptyString(payload.entryId) && isOptionalBoolean(payload.fallbackToClipboard);
}

export function isInsertTargetMessage(value: unknown): value is InsertTargetMessage {
    if (!isMessageEnvelope(value) || value.source !== "background" || value.target !== "content-script" || value.type !== "insert/target") {
        return false;
    }

    if (!isRecord(value.payload)) {
        return false;
    }

    if (!Object.keys(value.payload).every((key) => (INSERT_TARGET_KEYS as readonly string[]).includes(key))) {
        return false;
    }

    return (
        isNonEmptyString(value.payload.entryId) &&
        isNonEmptyString(value.payload.value) &&
        isOptionalStringArray(value.payload.domainAllowlist) &&
        isOptionalBoolean(value.payload.fallbackToClipboard) &&
        isOptionalNumber(value.payload.frameId)
    );
}

export function isVaultGetStatusMessage(value: unknown): value is VaultGetStatusMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "vault/getStatus" && isRecord(value.payload) && hasOnlyKeys(value.payload, []);
}

export function isVaultUnlockMessage(value: unknown): value is VaultUnlockMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "vault/unlock" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, ["masterPassword"]) &&
        typeof value.payload.masterPassword === "string" &&
        value.payload.masterPassword.trim().length > 0
    );
}

export function isVaultCreateMessage(value: unknown): value is VaultCreateMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "vault/create" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, ["masterPassword"]) &&
        typeof value.payload.masterPassword === "string" &&
        value.payload.masterPassword.trim().length > 0
    );
}

export function isVaultLockMessage(value: unknown): value is VaultLockMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "vault/lock" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, ["reason"]) &&
        typeof value.payload.reason === "string" &&
        (LOCK_REASONS as readonly string[]).includes(value.payload.reason)
    );
}

export function isVaultUpdatePreferencesMessage(value: unknown): value is VaultUpdatePreferencesMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "vault/updatePreferences" &&
        isRecord(value.payload) &&
        Object.keys(value.payload).every((key) => (PREFERENCE_KEYS as readonly string[]).includes(key)) &&
        Object.entries(value.payload).every(([key, nextValue]) => {
            switch (key) {
                case "autoLockMinutes":
                    return typeof nextValue === "number" && Number.isFinite(nextValue) && nextValue >= 0;
                case "defaultInsertMode":
                    return nextValue === "insert" || nextValue === "copy";
                case "clipboardWarningEnabled":
                case "telemetryEnabled":
                    return typeof nextValue === "boolean";
                case "theme":
                    return nextValue === "system" || nextValue === "light" || nextValue === "dark";
                default:
                    return false;
            }
        })
    );
}

export function isVaultExportMessage(value: unknown): value is VaultExportMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "vault/export" && isRecord(value.payload) && hasOnlyKeys(value.payload, []);
}

export function isVaultImportMessage(value: unknown): value is VaultImportMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "vault/import" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, ["file", "masterPassword", "mode"]) &&
        isVaultExportFile(value.payload.file) &&
        isNonEmptyString(value.payload.masterPassword) &&
        (value.payload.mode === "replace" || value.payload.mode === "merge")
    );
}

export function isEntriesListMessage(value: unknown): value is EntriesListMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/list" && isListEntriesPayload(value.payload);
}

export function isEntriesCreateMessage(value: unknown): value is EntriesCreateMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/create" && isCreateEntryPayload(value.payload);
}

export function isEntriesUpdateMessage(value: unknown): value is EntriesUpdateMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/update" && isUpdateEntryPayload(value.payload);
}

export function isEntriesDeleteMessage(value: unknown): value is EntriesDeleteMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/delete" && isDeleteEntryPayload(value.payload);
}

export function isEntriesReorderMessage(value: unknown): value is EntriesReorderMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/reorder" && isReorderEntryPayload(value.payload);
}

export function isEntriesInsertMessage(value: unknown): value is EntriesInsertMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/insert" && isInsertEntryPayload(value.payload);
}

export function isBillingLinkAccountMessage(value: unknown): value is BillingLinkAccountMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "billing/linkAccount" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, BILLING_LINK_ACCOUNT_KEYS) &&
        isNonEmptyString(value.payload.email)
    );
}

export function isBillingStartCheckoutMessage(value: unknown): value is BillingStartCheckoutMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "billing/startCheckout" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, BILLING_START_CHECKOUT_KEYS) &&
        (value.payload.plan === "pro-monthly" || value.payload.plan === "pro-yearly" || value.payload.plan === "lifetime")
    );
}

export function isBillingGetEntitlementMessage(value: unknown): value is BillingGetEntitlementMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "billing/getEntitlement" &&
        isRecord(value.payload) &&
        Object.keys(value.payload).every((key) => (BILLING_GET_ENTITLEMENT_KEYS as readonly string[]).includes(key)) &&
        isOptionalBoolean(value.payload.forceRefresh)
    );
}

export function isSyncSetProviderMessage(value: unknown): value is SyncSetProviderMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "sync/setProvider" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, SYNC_SET_PROVIDER_KEYS) &&
        (value.payload.provider === "drive" || value.payload.provider === "dropbox" || value.payload.provider === null)
    );
}

export function isSyncRequestMessage(value: unknown): value is SyncRequestMessage {
    return (
        isBackgroundRoutedEnvelope(value) &&
        value.type === "sync/request" &&
        isRecord(value.payload) &&
        hasOnlyKeys(value.payload, SYNC_REQUEST_KEYS) &&
        (value.payload.action === "push" || value.payload.action === "pull")
    );
}

export function isBackgroundMessage(value: unknown): value is RoutedBackgroundMessage {
    return (
        isVaultGetStatusMessage(value) ||
        isVaultCreateMessage(value) ||
        isVaultUnlockMessage(value) ||
        isVaultLockMessage(value) ||
        isVaultExportMessage(value) ||
        isVaultImportMessage(value) ||
        isVaultUpdatePreferencesMessage(value) ||
        isEntriesListMessage(value) ||
        isEntriesCreateMessage(value) ||
        isEntriesUpdateMessage(value) ||
        isEntriesDeleteMessage(value) ||
        isEntriesReorderMessage(value) ||
        isEntriesInsertMessage(value) ||
        isBillingLinkAccountMessage(value) ||
        isBillingStartCheckoutMessage(value) ||
        isBillingGetEntitlementMessage(value) ||
        isSyncSetProviderMessage(value) ||
        isSyncRequestMessage(value)
    );
}

export function createMessageEnvelope<TType extends string, TPayload>(params: {
    id: string;
    type: TType;
    source: MessageTarget;
    target: MessageTarget;
    payload: TPayload;
}): MessageEnvelope<TType, TPayload> {
    return params;
}
