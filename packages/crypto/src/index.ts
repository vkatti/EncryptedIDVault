import type { AppError, AppResult, KdfParameters, VaultDocument, VaultEnvelope } from "@encrypted-id-vault/shared";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const DEFAULT_PBKDF2_ITERATIONS = 210000;
export const AES_KEY_BYTES = 32;
export const HMAC_KEY_BYTES = 32;
export const KEY_MATERIAL_BYTES = AES_KEY_BYTES + HMAC_KEY_BYTES;

export function createKdfParameters(overrides?: Partial<KdfParameters> & { salt?: string }): KdfParameters {
    return {
        name: overrides?.name ?? "pbkdf2",
        salt: overrides?.salt ?? base64FromBytes(crypto.getRandomValues(new Uint8Array(16))),
        iterations: overrides?.iterations ?? DEFAULT_PBKDF2_ITERATIONS,
        memory: overrides?.memory,
        parallelism: overrides?.parallelism
    };
}

export function base64FromBytes(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

export function bytesFromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKeyMaterial(password: string, kdf: KdfParameters): Promise<Uint8Array> {
    if (kdf.name !== "pbkdf2") {
        throw new Error(`Unsupported KDF: ${kdf.name}`);
    }

    const salt = bytesFromBase64(kdf.salt);
    const iterations = kdf.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        textEncoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: toArrayBuffer(salt),
            iterations,
            hash: "SHA-256"
        },
        passwordKey,
        KEY_MATERIAL_BYTES * 8
    );

    return new Uint8Array(bits);
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function importHmacKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function hmacBase64(key: CryptoKey, data: Uint8Array): Promise<string> {
    const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(data));
    return base64FromBytes(new Uint8Array(signature));
}

function serializeDocument(document: VaultDocument): Uint8Array {
    return textEncoder.encode(JSON.stringify(document));
}

function deserializeDocument(payload: Uint8Array): VaultDocument {
    return JSON.parse(textDecoder.decode(payload)) as VaultDocument;
}

function createAppError(code: AppError["code"], message: string, details?: Record<string, unknown>): AppError {
    return { code, message, details };
}

export async function createVaultEnvelope(document: VaultDocument, masterPassword: string, kdf = createKdfParameters()): Promise<VaultEnvelope> {
    const keyMaterial = await deriveKeyMaterial(masterPassword, kdf);
    const encryptionKey = await importAesKey(keyMaterial.slice(0, AES_KEY_BYTES));
    const integrityKey = await importHmacKey(keyMaterial.slice(AES_KEY_BYTES));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = serializeDocument(document);
    const ciphertextBytes = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(nonce) }, encryptionKey, toArrayBuffer(plaintext))
    );

    return {
        schemaVersion: document.schemaVersion,
        vaultId: document.vaultId,
        kdf,
        encryption: {
            algorithm: "AES-GCM",
            nonce: base64FromBytes(nonce)
        },
        ciphertext: base64FromBytes(ciphertextBytes),
        integrity: {
            method: "hmac",
            value: await hmacBase64(integrityKey, ciphertextBytes)
        },
        meta: document.metadata
    };
}

export async function openVaultEnvelope(envelope: VaultEnvelope, masterPassword: string): Promise<AppResult<VaultDocument>> {
    try {
        const keyMaterial = await deriveKeyMaterial(masterPassword, envelope.kdf);
        const encryptionKey = await importAesKey(keyMaterial.slice(0, AES_KEY_BYTES));
        const integrityKey = await importHmacKey(keyMaterial.slice(AES_KEY_BYTES));
        const ciphertextBytes = bytesFromBase64(envelope.ciphertext);
        const expectedIntegrity = await hmacBase64(integrityKey, ciphertextBytes);

        if (expectedIntegrity !== envelope.integrity.value) {
            return {
                ok: false,
                error: createAppError("ERR_UNLOCK_INVALID_PASSWORD", "Unable to unlock vault")
            };
        }

        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: toArrayBuffer(bytesFromBase64(envelope.encryption.nonce)) },
            encryptionKey,
            toArrayBuffer(ciphertextBytes)
        );

        return {
            ok: true,
            value: deserializeDocument(new Uint8Array(plaintext))
        };
    } catch (error) {
        return {
            ok: false,
            error: createAppError("ERR_UNLOCK_INVALID_PASSWORD", "Unable to unlock vault", {
                cause: error instanceof Error ? error.message : String(error)
            })
        };
    }
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<VaultEnvelope>;
    return (
        candidate.schemaVersion === 1 &&
        typeof candidate.vaultId === "string" &&
        typeof candidate.ciphertext === "string" &&
        typeof candidate.integrity?.value === "string" &&
        typeof candidate.encryption?.nonce === "string" &&
        typeof candidate.kdf?.salt === "string"
    );
}
