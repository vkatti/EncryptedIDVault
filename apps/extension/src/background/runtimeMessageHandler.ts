import type { VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { isBackgroundMessage } from "@encrypted-id-vault/security";
import { routeBackgroundMessage, type BackgroundResponse, type RuntimeStateSnapshot } from "./messageRouter";
import type { BillingLifecycle } from "./billingLifecycle";
import type { VaultLifecycle } from "./vaultLifecycle";

type InvalidMessageResponse = {
    ok: false;
    error: "ERR_INVALID_MESSAGE";
};

export type RuntimeMessageResponse = BackgroundResponse | InvalidMessageResponse;

export async function handleRuntimeMessage(
    message: unknown,
    runtimeState: RuntimeStateSnapshot,
    createStatusMessage: () => VaultGetStatusMessage,
    vaultLifecycle: VaultLifecycle,
    billingLifecycle: BillingLifecycle,
    nowIso: string,
    insertEntry?: Parameters<typeof routeBackgroundMessage>[5]
): Promise<RuntimeMessageResponse> {
    if (!isBackgroundMessage(message)) {
        return { ok: false, error: "ERR_INVALID_MESSAGE" };
    }

    runtimeState.lastMessageAt = nowIso;
    return routeBackgroundMessage(message, runtimeState, createStatusMessage, vaultLifecycle, billingLifecycle, insertEntry);
}
