import type {
    CreateEntryPayload,
    ErrorCode,
    ListEntriesPayload,
    MessageEnvelope,
    MessageTarget,
    UpdateEntryPayload,
    EntriesCreateMessage,
    EntriesListMessage,
    EntriesUpdateMessage,
    VaultCreateMessage,
    VaultGetStatusMessage,
    VaultLockMessage,
    VaultUpdatePreferencesMessage,
    VaultUnlockMessage
} from "@encrypted-id-vault/shared";

import { ERROR_CODES } from "@encrypted-id-vault/shared";

export type { ErrorCode } from "@encrypted-id-vault/shared";

const MESSAGE_TARGETS: readonly MessageTarget[] = ["background", "popup", "options", "content-script"] as const;
const LOCK_REASONS = ["manual", "timeout", "restart"] as const;
const PREFERENCE_KEYS = ["autoLockMinutes", "defaultInsertMode", "clipboardWarningEnabled", "theme", "telemetryEnabled"] as const;
const ENTRY_CREATE_KEYS = ["label", "value", "category", "notes", "favorite", "domainAllowlist", "copyModeAllowed", "insertModeAllowed"] as const;
const ENTRY_UPDATE_KEYS = ["entryId", "label", "value", "category", "notes", "favorite", "domainAllowlist", "copyModeAllowed", "insertModeAllowed"] as const;
const ENTRY_LIST_KEYS = ["query", "favoritesOnly"] as const;

type RoutedBackgroundMessage =
    | VaultGetStatusMessage
    | VaultCreateMessage
    | VaultUnlockMessage
    | VaultLockMessage
    | VaultUpdatePreferencesMessage
    | EntriesListMessage
    | EntriesCreateMessage
    | EntriesUpdateMessage;

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

export function isEntriesListMessage(value: unknown): value is EntriesListMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/list" && isListEntriesPayload(value.payload);
}

export function isEntriesCreateMessage(value: unknown): value is EntriesCreateMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/create" && isCreateEntryPayload(value.payload);
}

export function isEntriesUpdateMessage(value: unknown): value is EntriesUpdateMessage {
    return isBackgroundRoutedEnvelope(value) && value.type === "entries/update" && isUpdateEntryPayload(value.payload);
}

export function isBackgroundMessage(value: unknown): value is RoutedBackgroundMessage {
    return (
        isVaultGetStatusMessage(value) ||
        isVaultCreateMessage(value) ||
        isVaultUnlockMessage(value) ||
        isVaultLockMessage(value) ||
        isVaultUpdatePreferencesMessage(value) ||
        isEntriesListMessage(value) ||
        isEntriesCreateMessage(value) ||
        isEntriesUpdateMessage(value)
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
