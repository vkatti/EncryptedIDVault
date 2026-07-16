import type { BackgroundMessage, VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import type { VaultLifecycle } from "./vaultLifecycle";

export type RuntimeStateSnapshot = {
    installedAt: string | null;
    lastMessageAt: string | null;
    lastUserTrigger: string | null;
    locked: boolean;
    hasVault: boolean;
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
        ok: false;
        error: "ERR_UNHANDLED_MESSAGE" | "ERR_UNLOCK_INVALID_PASSWORD" | "ERR_VAULT_ALREADY_EXISTS" | "ERR_VAULT_NOT_FOUND";
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
    vaultLifecycle: VaultLifecycle
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
                    lastUserTrigger: runtimeState.lastUserTrigger
                }
            };
        case "vault/create":
            return applyLifecycleResult(await vaultLifecycle.createVault(message.payload.masterPassword), runtimeState);
        case "vault/unlock":
            return applyLifecycleResult(await vaultLifecycle.unlockVault(message.payload.masterPassword), runtimeState);
        case "vault/lock":
            return applyLifecycleResult(await vaultLifecycle.lockVault(), runtimeState);
        default:
            return { ok: false, error: "ERR_UNHANDLED_MESSAGE" };
    }
}
