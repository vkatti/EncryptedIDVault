import type { InsertTargetMessage, VaultEntry } from "@encrypted-id-vault/shared";

import { createMessageEnvelope } from "@encrypted-id-vault/security";

import type { VaultLifecycle } from "./vaultLifecycle";

const SELECTED_ENTRY_KEY = "lastSelectedEntryId";

export type InsertEntryByIdResult =
    | {
        ok: true;
        insertedEntryId: string;
        insertionMode: "insert" | "clipboard";
    }
    | {
        ok: false;
        error:
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

type ContentScriptInsertResponse =
    | {
        ok: true;
        mode: "insert" | "clipboard";
    }
    | {
        ok: false;
        error:
        | "ERR_INSERT_NO_FOCUSED_FIELD"
        | "ERR_INSERT_UNSUPPORTED_ELEMENT"
        | "ERR_INSERT_DOMAIN_NOT_ALLOWED"
        | "ERR_INSERT_CLIPBOARD_UNAVAILABLE";
    };

async function getSelectedEntryId(): Promise<string | null> {
    const stored = await chrome.storage.session.get([SELECTED_ENTRY_KEY]);
    return typeof stored[SELECTED_ENTRY_KEY] === "string" ? stored[SELECTED_ENTRY_KEY] : null;
}

export async function rememberSelectedEntryId(entryId: string): Promise<void> {
    await chrome.storage.session.set({ [SELECTED_ENTRY_KEY]: entryId });
}

async function sendInsertMessageToActiveTab(entry: VaultEntry, fallbackToClipboard?: boolean, frameId?: number, explicitTabId?: number): Promise<ContentScriptInsertResponse | null> {
    const targetTabIds = new Set<number>();

    if (typeof explicitTabId === "number") {
        targetTabIds.add(explicitTabId);
    }

    for (const queryOptions of [
        { active: true, windowType: "normal" as const },
        { active: true, currentWindow: true as const },
        { active: true, lastFocusedWindow: true as const },
        { active: true }
    ]) {
        const tabId = (await chrome.tabs.query(queryOptions))[0]?.id;
        if (typeof tabId === "number") {
            targetTabIds.add(tabId);
        }
    }

    if (targetTabIds.size === 0) {
        return null;
    }

    const message: InsertTargetMessage = createMessageEnvelope({
        id: crypto.randomUUID(),
        type: "insert/target",
        source: "background",
        target: "content-script",
        payload: {
            entryId: entry.id,
            value: entry.value,
            domainAllowlist: entry.domainAllowlist,
            fallbackToClipboard,
            frameId
        }
    });

    for (const targetTabId of targetTabIds) {
        try {
            const response = (frameId === undefined
                ? await chrome.tabs.sendMessage(targetTabId, message)
                : await chrome.tabs.sendMessage(targetTabId, message, { frameId })) as ContentScriptInsertResponse | undefined;

            if (response) {
                return response;
            }
        } catch {
            // Try next candidate tab.
        }
    }

    return null;
}

export async function insertEntryById(params: {
    entryId: string;
    fallbackToClipboard?: boolean;
    frameId?: number;
    tabId?: number;
    vaultLifecycle: VaultLifecycle;
}): Promise<InsertEntryByIdResult> {
    await rememberSelectedEntryId(params.entryId);

    const listResult = await params.vaultLifecycle.listEntries();
    if (!listResult.ok) {
        return { ok: false, error: listResult.error };
    }

    const entry = listResult.entries.find((candidate) => candidate.id === params.entryId);
    if (!entry) {
        return { ok: false, error: "ERR_ENTRY_NOT_FOUND" };
    }

    if (!entry.insertModeAllowed && !params.fallbackToClipboard) {
        return { ok: false, error: "ERR_ENTRY_INSERT_DISABLED" };
    }

    if (params.fallbackToClipboard && !entry.copyModeAllowed) {
        return { ok: false, error: "ERR_ENTRY_COPY_DISABLED" };
    }

    const response = await sendInsertMessageToActiveTab(entry, params.fallbackToClipboard, params.frameId, params.tabId);
    if (!response) {
        return { ok: false, error: "ERR_NO_ACTIVE_TAB" };
    }

    if (!response.ok) {
        return { ok: false, error: response.error };
    }

    return {
        ok: true,
        insertedEntryId: entry.id,
        insertionMode: response.mode
    };
}

export async function getRememberedSelectedEntryId(): Promise<string | null> {
    return getSelectedEntryId();
}