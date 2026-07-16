import type { BackgroundMessage, VaultGetStatusMessage } from "@encrypted-id-vault/shared";

import { createMessageEnvelope } from "@encrypted-id-vault/security";
import { getCommandTriggerSource, getContextMenuTriggerSource } from "./triggerSource";
import { handleRuntimeMessage } from "./runtimeMessageHandler";
import { createVaultLifecycle } from "./vaultLifecycle";

type ExtensionRuntimeState = {
    installedAt: string | null;
    lastMessageAt: string | null;
    lastUserTrigger: string | null;
    lastUnlockedAt: string | null;
    locked: boolean;
    hasVault: boolean;
};

const runtimeState: ExtensionRuntimeState = {
    installedAt: null,
    lastMessageAt: null,
    lastUserTrigger: null,
    lastUnlockedAt: null,
    locked: true,
    hasVault: false
};

const vaultLifecycle = createVaultLifecycle();
const AUTO_LOCK_ALARM_NAME = "vault-auto-lock";

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

async function loadVaultStatus(): Promise<void> {
    const state = await vaultLifecycle.initialize();
    runtimeState.hasVault = state.hasVault;
    runtimeState.locked = state.locked;
    runtimeState.lastUnlockedAt = state.lastUnlockedAt;
}

function clearAutoLockAlarm(): void {
    void chrome.alarms.clear(AUTO_LOCK_ALARM_NAME);
}

function scheduleAutoLockAlarm(): void {
    const minutes = vaultLifecycle.getAutoLockMinutes();

    if (minutes === null || minutes <= 0) {
        clearAutoLockAlarm();
        return;
    }

    chrome.alarms.create(AUTO_LOCK_ALARM_NAME, { delayInMinutes: minutes });
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
    runtimeState.locked = true;
    runtimeState.hasVault = false;
    void chrome.storage.local.set({ installedAt });
    createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
    runtimeState.lastMessageAt = null;
    runtimeState.lastUserTrigger = null;
    void loadInstalledAt();
    void loadVaultStatus();
    clearAutoLockAlarm();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void (async () => {
        const response = await handleRuntimeMessage(message, runtimeState, createStatusMessage, vaultLifecycle, new Date().toISOString());

        if (response.ok && "locked" in response) {
            if (response.locked) {
                clearAutoLockAlarm();
            } else {
                scheduleAutoLockAlarm();
            }

            runtimeState.lastUnlockedAt = vaultLifecycle.getStatus().lastUnlockedAt;
        }

        sendResponse(response);
    })();
    return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== AUTO_LOCK_ALARM_NAME || runtimeState.locked) {
        return;
    }

    void (async () => {
        const result = await vaultLifecycle.lockVault();

        if (!result.ok) {
            return;
        }

        runtimeState.hasVault = result.hasVault;
        runtimeState.locked = result.locked;
        runtimeState.lastUnlockedAt = vaultLifecycle.getStatus().lastUnlockedAt;
        clearAutoLockAlarm();
    })();
});

chrome.commands.onCommand.addListener((command) => {
    runtimeState.lastMessageAt = new Date().toISOString();

    const triggerSource = getCommandTriggerSource(command, [COMMAND_IDS.openVaultPopup, COMMAND_IDS.insertSelectedEntry]);

    if (triggerSource) {
        runtimeState.lastUserTrigger = triggerSource;
        console.info(`[Encrypted ID Vault] Command received (placeholder): ${command}`);
    }
});

chrome.contextMenus.onClicked.addListener((info) => {
    runtimeState.lastMessageAt = new Date().toISOString();

    const triggerSource = getContextMenuTriggerSource(info.menuItemId, CONTEXT_MENU_IDS.insertSelectedEntry);

    if (triggerSource) {
        runtimeState.lastUserTrigger = triggerSource;
        console.info("[Encrypted ID Vault] Context menu clicked (placeholder): insert-selected-entry");
    }
});

void loadInstalledAt();
void loadVaultStatus();
clearAutoLockAlarm();
