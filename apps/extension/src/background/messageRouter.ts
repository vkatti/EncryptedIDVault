import type { BackgroundMessage, VaultGetStatusMessage } from "@encrypted-id-vault/shared";

export type RuntimeStateSnapshot = {
    installedAt: string | null;
    lastMessageAt: string | null;
    lastUserTrigger: string | null;
    locked: boolean;
    hasVault: boolean;
};

type BackgroundResponse =
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
          error: "ERR_UNHANDLED_MESSAGE";
      };

type HandledMessageType = "vault/getStatus" | "vault/lock" | "vault/unlock";

type HandlerContext = {
    runtimeState: RuntimeStateSnapshot;
    createStatusMessage: () => VaultGetStatusMessage;
};

const handlers: Record<HandledMessageType, (context: HandlerContext) => BackgroundResponse> = {
    "vault/getStatus": ({ runtimeState, createStatusMessage }) => ({
        ok: true,
        message: createStatusMessage(),
        state: {
            installedAt: runtimeState.installedAt,
            locked: runtimeState.locked,
            hasVault: runtimeState.hasVault,
            lastMessageAt: runtimeState.lastMessageAt,
            lastUserTrigger: runtimeState.lastUserTrigger
        }
    }),
    "vault/lock": ({ runtimeState }) => {
        runtimeState.locked = true;
        return { ok: true, locked: true };
    },
    "vault/unlock": ({ runtimeState }) => {
        runtimeState.locked = false;
        return { ok: true, locked: false };
    }
};

function isHandledMessageType(type: BackgroundMessage["type"]): type is HandledMessageType {
    return type in handlers;
}

export function routeBackgroundMessage(
    message: BackgroundMessage,
    runtimeState: RuntimeStateSnapshot,
    createStatusMessage: () => VaultGetStatusMessage
): BackgroundResponse {
    if (!isHandledMessageType(message.type)) {
        return { ok: false, error: "ERR_UNHANDLED_MESSAGE" };
    }

    return handlers[message.type]({ runtimeState, createStatusMessage });
}
