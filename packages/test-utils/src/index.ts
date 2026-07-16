import type { VaultEnvelope } from "@encrypted-id-vault/shared";

export function createMockVaultEnvelope(overrides: Partial<VaultEnvelope> = {}): VaultEnvelope {
    const timestamp = new Date().toISOString();

    return {
        schemaVersion: 1,
        vaultId: "vault-test-id",
        kdf: {
            name: "pbkdf2",
            salt: "c2FsdA==",
            iterations: 210000
        },
        encryption: {
            algorithm: "AES-GCM",
            nonce: "bm9uY2U="
        },
        ciphertext: "Y2lwaGVydGV4dA==",
        integrity: {
            method: "hmac",
            value: "aW50ZWdyaXR5"
        },
        meta: {
            createdAt: timestamp,
            updatedAt: timestamp,
            syncProvider: null
        },
        ...overrides
    };
}

export function createTestMessageId(prefix = "msg"): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createJsonClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
