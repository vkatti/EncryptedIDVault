import type {
    BackgroundMessage,
    BillingPlan,
    VaultEntry,
    VaultExportFile,
    VaultGetStatusMessage,
    VaultPreferences
} from "@encrypted-id-vault/shared";

import type { VaultLifecycle } from "./vaultLifecycle";
import { insertEntryById, type InsertEntryByIdResult } from "./insertionEngine";
import type { BillingLifecycle } from "./billingLifecycle";

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
        file: VaultExportFile;
    }
    | {
        ok: true;
        mode: "replace" | "merge";
        entryCount: number;
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
        ok: true;
        accountId: string;
    }
    | {
        ok: true;
        checkoutUrl: string;
    }
    | {
        ok: true;
        entitlement: {
            accountId: string | null;
            tier: "free" | "pro" | "lifetime";
            state: "active" | "grace" | "expired" | "unknown";
            expiresAt: string | null;
            checkedAt: string | null;
            source: "network" | "cache" | "default";
            syncProvider: "drive" | "dropbox" | null;
            syncEnabled: boolean;
        };
    }
    | {
        ok: true;
        provider: "drive" | "dropbox" | null;
    }
    | {
        ok: true;
        syncAction: "push" | "pull";
        syncProvider: "drive" | "dropbox";
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
        | "ERR_INSERT_CLIPBOARD_UNAVAILABLE"
        | "ERR_IMPORT_SCHEMA_UNSUPPORTED"
        | "ERR_VAULT_CORRUPT"
        | "ERR_BILLING_ENTITLEMENT_UNKNOWN"
        | "ERR_SYNC_REQUIRES_PRO";
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
    billingLifecycle: BillingLifecycle,
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
        case "vault/export": {
            const result = await vaultLifecycle.exportVaultFile();

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, file: result.file };
        }
        case "vault/import": {
            const result = await vaultLifecycle.importVaultFile(message.payload.file, message.payload.masterPassword, message.payload.mode);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            const status = await vaultLifecycle.initialize();
            runtimeState.hasVault = status.hasVault;
            runtimeState.locked = status.locked;
            runtimeState.lastUnlockedAt = status.lastUnlockedAt;
            runtimeState.preferences = vaultLifecycle.getStatus().preferences;

            return { ok: true, mode: result.mode, entryCount: result.entryCount };
        }
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
        case "billing/linkAccount": {
            const result = await billingLifecycle.linkAccount(message.payload.email);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, accountId: result.value.accountId };
        }
        case "billing/startCheckout": {
            const result = await billingLifecycle.startCheckout(message.payload.plan as BillingPlan);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, checkoutUrl: result.value.checkoutUrl };
        }
        case "billing/getEntitlement": {
            const result = await billingLifecycle.getEntitlement(message.payload.forceRefresh);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, entitlement: result.value };
        }
        case "sync/setProvider": {
            const result = await billingLifecycle.setSyncProvider(message.payload.provider);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return { ok: true, provider: result.value.provider };
        }
        case "sync/request": {
            const result = await billingLifecycle.requestSync(message.payload.action);

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            return {
                ok: true,
                syncAction: result.value.action,
                syncProvider: result.value.provider
            };
        }
        default:
            return { ok: false, error: "ERR_UNHANDLED_MESSAGE" };
    }
}
