import type { BackgroundMessage, VaultEntry, VaultGetStatusMessage, VaultPreferences } from "@encrypted-id-vault/shared";

import type { VaultLifecycle } from "./vaultLifecycle";
import { insertEntryById, type InsertEntryByIdResult } from "./insertionEngine";

export type RuntimeStateSnapshot = {
    installedAt: string | null;
    lastMessageAt: string | null;
    lastUserTrigger: string | null;
    lastUnlockedAt: string | null;
    locked: boolean;
    hasVault: boolean;
    preferences: VaultPreferences | null;
};

export type BackgroundResponse =
    | {
        ok: true;
        message: VaultGetStatusMessage;
        state: RuntimeStateSnapshot;
    }
    | {
        ok: true;
        locked: boolean;
    }
    | {
        ok: true;
        preferences: VaultPreferences | null;
    }
    | {
        ok: true;
        entries: VaultEntry[];
    }
    | {
        ok: true;
        entry: VaultEntry;
    }
    | {
        ok: true;
        deletedEntryId: string;
    }
    | {
        ok: true;
        insertedEntryId: string;
        insertionMode: "insert" | "clipboard";
    }
    | {
        ok: false;
        error:
        | "ERR_UNHANDLED_MESSAGE"
        | "ERR_UNLOCK_INVALID_PASSWORD"
        | "ERR_VAULT_ALREADY_EXISTS"
        | "ERR_VAULT_NOT_FOUND"
        | "ERR_VAULT_LOCKED"
        | "ERR_ENTRY_NOT_FOUND"
        | "ERR_ENTRY_INSERT_DISABLED"
        | "ERR_ENTRY_COPY_DISABLED"
        | "ERR_NO_ACTIVE_TAB"
        | "ERR_INSERT_NO_FOCUSED_FIELD"
        | "ERR_INSERT_UNSUPPORTED_ELEMENT"
        | "ERR_INSERT_DOMAIN_NOT_ALLOWED"
        | "ERR_INSERT_CLIPBOARD_UNAVAILABLE";
    };

async function applyLifecycleResult(
    result: Awaited<ReturnType<VaultLifecycle["createVault"]>>,
    runtimeState: RuntimeStateSnapshot
): Promise<BackgroundResponse> {
    if (!result.ok) {
        return { ok: false, error: result.error };
    }

    runtimeState.hasVault = result.hasVault;
    runtimeState.locked = result.locked;
    return { ok: true, locked: result.locked };
}

export async function routeBackgroundMessage(
    message: BackgroundMessage,
    runtimeState: RuntimeStateSnapshot,
    createStatusMessage: () => VaultGetStatusMessage,
    vaultLifecycle: VaultLifecycle,
    insertEntry: typeof insertEntryById = insertEntryById
): Promise<BackgroundResponse> {
    switch (message.type) {
        case "vault/getStatus":
            return {
                ok: true,
                message: createStatusMessage(),
                state: {
                    installedAt: runtimeState.installedAt,
                    locked: runtimeState.locked,
                    hasVault: runtimeState.hasVault,
                    lastMessageAt: runtimeState.lastMessageAt,
                    lastUserTrigger: runtimeState.lastUserTrigger,
                    lastUnlockedAt: runtimeState.lastUnlockedAt,
                    preferences: runtimeState.preferences
                }
            };
        case "vault/create":
            return applyLifecycleResult(await vaultLifecycle.createVault(message.payload.masterPassword), runtimeState);
        case "vault/unlock":
            return applyLifecycleResult(await vaultLifecycle.unlockVault(message.payload.masterPassword), runtimeState);
        case "vault/lock":
            return applyLifecycleResult(await vaultLifecycle.lockVault(), runtimeState);
        case "vault/updatePreferences": {
            const result = await vaultLifecycle.updatePreferences(message.payload);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            runtimeState.hasVault = result.hasVault;
            runtimeState.locked = result.locked;
            runtimeState.preferences = vaultLifecycle.getStatus().preferences;
            return { ok: true, preferences: runtimeState.preferences };
        }
        case "entries/list": {
            const result = await vaultLifecycle.listEntries(message.payload);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, entries: result.entries };
        }
        case "entries/create": {
            const result = await vaultLifecycle.createEntry(message.payload);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, entry: result.entry };
        }
        case "entries/update": {
            const { entryId, ...updates } = message.payload;
            const result = await vaultLifecycle.updateEntry(entryId, updates);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, entry: result.entry };
        }
        case "entries/delete": {
            const result = await vaultLifecycle.deleteEntry(message.payload.entryId);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, deletedEntryId: result.deletedEntryId };
        }
        case "entries/reorder": {
            const result = await vaultLifecycle.reorderEntry(message.payload.entryId, message.payload.targetIndex);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, entry: result.entry };
        }
        case "entries/insert": {
            const result = await insertEntry({
                entryId: message.payload.entryId,
                fallbackToClipboard: message.payload.fallbackToClipboard,
                vaultLifecycle
            });

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return {
                ok: true,
                insertedEntryId: result.insertedEntryId,
                insertionMode: result.insertionMode
            };
        }
        default:
            return { ok: false, error: "ERR_UNHANDLED_MESSAGE" };
    }
}
