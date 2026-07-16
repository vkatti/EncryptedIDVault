import type {
    ErrorCode,
    MessageEnvelope,
    MessageTarget,
    VaultGetStatusMessage,
    VaultLockMessage,
    VaultUnlockMessage
} from "@encrypted-id-vault/shared";

import { ERROR_CODES } from "@encrypted-id-vault/shared";

export type { ErrorCode } from "@encrypted-id-vault/shared";

const MESSAGE_TARGETS: readonly MessageTarget[] = ["background", "popup", "options", "content-script"] as const;
const LOCK_REASONS = ["manual", "timeout", "restart"] as const;

type RoutedBackgroundMessage = VaultGetStatusMessage | VaultUnlockMessage | VaultLockMessage;

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

export function isBackgroundMessage(value: unknown): value is RoutedBackgroundMessage {
    return isVaultGetStatusMessage(value) || isVaultUnlockMessage(value) || isVaultLockMessage(value);
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
