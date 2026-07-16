import type {
    BackgroundMessage,
    ErrorCode,
    MessageEnvelope,
    MessageTarget,
    SyncConnectProviderMessage,
    VaultGetStatusMessage,
    VaultLockMessage,
    VaultUnlockMessage
} from "@encrypted-id-vault/shared";

import { ERROR_CODES } from "@encrypted-id-vault/shared";

export type { ErrorCode } from "@encrypted-id-vault/shared";

const MESSAGE_TARGETS: readonly MessageTarget[] = ["background", "popup", "options", "content-script"] as const;

export function isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function isMessageTarget(value: unknown): value is MessageTarget {
    return typeof value === "string" && MESSAGE_TARGETS.includes(value as MessageTarget);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function isMessageEnvelope(value: unknown): value is MessageEnvelope<string, unknown> {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.type === "string" &&
        isMessageTarget(value.source) &&
        isMessageTarget(value.target) &&
        "payload" in value
    );
}

export function isVaultGetStatusMessage(value: unknown): value is VaultGetStatusMessage {
    return isMessageEnvelope(value) && value.type === "vault/getStatus";
}

export function isVaultUnlockMessage(value: unknown): value is VaultUnlockMessage {
    return isMessageEnvelope(value) && value.type === "vault/unlock" && isRecord(value.payload) && typeof value.payload.masterPassword === "string";
}

export function isVaultLockMessage(value: unknown): value is VaultLockMessage {
    return isMessageEnvelope(value) && value.type === "vault/lock" && isRecord(value.payload) && typeof value.payload.reason === "string";
}

export function isSyncConnectProviderMessage(value: unknown): value is SyncConnectProviderMessage {
    return isMessageEnvelope(value) && value.type === "sync/connectProvider" && isRecord(value.payload) && typeof value.payload.provider === "string";
}

export function isBackgroundMessage(value: unknown): value is BackgroundMessage {
    return (
        isVaultGetStatusMessage(value) ||
        isVaultUnlockMessage(value) ||
        isVaultLockMessage(value) ||
        isSyncConnectProviderMessage(value)
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
