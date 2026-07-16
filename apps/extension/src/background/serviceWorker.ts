import type { BackgroundMessage, VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { createMessageEnvelope, isBackgroundMessage } from "@encrypted-id-vault/security";

type ExtensionRuntimeState = {
    installedAt: string | null;
    lastMessageAt: string | null;
    locked: boolean;
    hasVault: boolean;
};

const runtimeState: ExtensionRuntimeState = {
    installedAt: null,
    lastMessageAt: null,
    locked: true,
    hasVault: false
};

const COMMAND_IDS = {
    openVaultPopup: "open-vault-popup",
    insertSelectedEntry: "insert-selected-entry"
} as const;

const CONTEXT_MENU_IDS = {
    insertSelectedEntry: "insert-selected-entry-context"
} as const;

async function loadInstalledAt(): Promise<void> {
    const stored = await chrome.storage.local.get(["installedAt"]);
    runtimeState.installedAt = typeof stored.installedAt === "string" ? stored.installedAt : null;
}

function createStatusMessage(): VaultGetStatusMessage {
    return createMessageEnvelope({
        id: crypto.randomUUID(),
        type: "vault/getStatus",
        source: "background",
        target: "popup",
        payload: {}
    });
}

function createContextMenus(): void {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: CONTEXT_MENU_IDS.insertSelectedEntry,
            title: "Insert from Encrypted ID Vault",
            contexts: ["editable"]
        });
    });
}

chrome.runtime.onInstalled.addListener(() => {
    const installedAt = new Date().toISOString();

    runtimeState.installedAt = installedAt;
    void chrome.storage.local.set({ installedAt });
    createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
    runtimeState.locked = true;
    runtimeState.lastMessageAt = null;
    void loadInstalledAt();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isBackgroundMessage(message)) {
        sendResponse({ ok: false, error: "ERR_INVALID_MESSAGE" });
        return false;
    }

    runtimeState.lastMessageAt = new Date().toISOString();

    if (message.type === "vault/getStatus") {
        const statusMessage = createStatusMessage();

        sendResponse({
            ok: true,
            message: statusMessage,
            state: {
                installedAt: runtimeState.installedAt,
                locked: runtimeState.locked,
                hasVault: runtimeState.hasVault,
                lastMessageAt: runtimeState.lastMessageAt
            }
        });
        return false;
    }

    if (message.type === "vault/lock") {
        runtimeState.locked = true;
        sendResponse({ ok: true, locked: true });
        return false;
    }

    if (message.type === "vault/unlock") {
        runtimeState.locked = false;
        sendResponse({ ok: true, locked: false });
        return false;
    }

    sendResponse({ ok: false, error: "ERR_UNHANDLED_MESSAGE" });
    return false;
});

chrome.commands.onCommand.addListener((command) => {
    runtimeState.lastMessageAt = new Date().toISOString();

    if (command === COMMAND_IDS.openVaultPopup || command === COMMAND_IDS.insertSelectedEntry) {
        console.info(`[Encrypted ID Vault] Command received (placeholder): ${command}`);
    }
});

chrome.contextMenus.onClicked.addListener((info) => {
    runtimeState.lastMessageAt = new Date().toISOString();

    if (info.menuItemId === CONTEXT_MENU_IDS.insertSelectedEntry) {
        console.info("[Encrypted ID Vault] Context menu clicked (placeholder): insert-selected-entry");
    }
});

void loadInstalledAt();
