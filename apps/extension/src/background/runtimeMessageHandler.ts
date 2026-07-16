import type { VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { isBackgroundMessage } from "@encrypted-id-vault/security";
import { routeBackgroundMessage, type BackgroundResponse, type RuntimeStateSnapshot } from "./messageRouter";

type InvalidMessageResponse = {
    ok: false;
    error: "ERR_INVALID_MESSAGE";
};

export type RuntimeMessageResponse = BackgroundResponse | InvalidMessageResponse;

export function handleRuntimeMessage(
    message: unknown,
    runtimeState: RuntimeStateSnapshot,
    createStatusMessage: () => VaultGetStatusMessage,
    nowIso: string
): RuntimeMessageResponse {
    if (!isBackgroundMessage(message)) {
        return { ok: false, error: "ERR_INVALID_MESSAGE" };
    }

    runtimeState.lastMessageAt = nowIso;
    return routeBackgroundMessage(message, runtimeState, createStatusMessage);
}
