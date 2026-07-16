export const ERROR_CODES = [
    "ERR_UNLOCK_INVALID_PASSWORD",
    "ERR_VAULT_CORRUPT",
    "ERR_IMPORT_SCHEMA_UNSUPPORTED",
    "ERR_INSERT_NO_FOCUSED_FIELD",
    "ERR_INSERT_UNSUPPORTED_ELEMENT",
    "ERR_INSERT_DOMAIN_NOT_ALLOWED",
    "ERR_INSERT_CLIPBOARD_UNAVAILABLE",
    "ERR_PROVIDER_AUTH_FAILED",
    "ERR_PROVIDER_SCOPE_DENIED",
    "ERR_SYNC_CONFLICT",
    "ERR_BILLING_ENTITLEMENT_UNKNOWN",
    "ERR_NETWORK_OFFLINE"
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
}

export interface Result<T> {
    ok: true;
    value: T;
}

export interface FailureResult {
    ok: false;
    error: AppError;
}

export type AppResult<T> = Result<T> | FailureResult;
