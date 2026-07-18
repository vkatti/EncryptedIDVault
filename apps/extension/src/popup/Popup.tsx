import React from "react";

import { createMessageEnvelope } from "@encrypted-id-vault/security";
import type { VaultEntry, VaultExportFile, VaultPreferences } from "@encrypted-id-vault/shared";

type PopupStatus = {
    installedAt: string | null;
    locked: boolean;
    hasVault: boolean;
    lastMessageAt: string | null;
    lastUserTrigger: string | null;
    lastUnlockedAt: string | null;
    preferences: VaultPreferences | null;
};

type StatusResponse = {
    ok: boolean;
    message?: {
        id: string;
        type: string;
    };
    state?: PopupStatus;
    error?: string;
};

type EntryListResponse = {
    ok: boolean;
    entries?: VaultEntry[];
    error?: string;
};

type InsertResponse = {
    ok: boolean;
    insertedEntryId?: string;
    insertionMode?: "insert" | "clipboard";
    error?: string;
};

type VaultImportResponse = {
    ok: boolean;
    mode?: "replace" | "merge";
    entryCount?: number;
    error?: string;
};

type Action = "vault/getStatus" | "vault/create" | "vault/unlock" | "vault/lock";

export function getVaultExportErrorMessage(errorCode?: string): string {
    if (errorCode === "ERR_VAULT_NOT_FOUND") {
        return "No vault exists yet. Create a vault before exporting.";
    }

    return "Unable to export vault. Try again.";
}

export function getVaultImportErrorMessage(errorCode?: string): string {
    switch (errorCode) {
        case "ERR_UNLOCK_INVALID_PASSWORD":
            return "Import failed: the master password does not match the imported vault.";
        case "ERR_IMPORT_SCHEMA_UNSUPPORTED":
            return "Import failed: this vault file uses an unsupported schema version.";
        case "ERR_VAULT_CORRUPT":
            return "Import failed: the vault file appears corrupted or tampered.";
        default:
            return "Unable to import vault. Verify the file and password, then try again.";
    }
}

async function sendMessage(action: Action, payload: Record<string, unknown>): Promise<StatusResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: action,
            source: "popup",
            target: "background",
            payload
        })
    )) as StatusResponse;
}

async function listEntriesMessage(payload: { query?: string; favoritesOnly?: boolean }): Promise<EntryListResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "entries/list",
            source: "popup",
            target: "background",
            payload
        })
    )) as EntryListResponse;
}

async function insertEntryMessage(payload: { entryId: string; tabId?: number; fallbackToClipboard?: boolean }): Promise<InsertResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "entries/insert",
            source: "popup",
            target: "background",
            payload
        })
    )) as InsertResponse;
}

async function importVaultMessage(payload: {
    file: VaultExportFile;
    masterPassword: string;
    mode: "replace" | "merge";
}): Promise<VaultImportResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "vault/import",
            source: "popup",
            target: "background",
            payload
        })
    )) as VaultImportResponse;
}

async function updatePreferencesMessage(payload: {
    autoLockMinutes?: number;
    defaultInsertMode?: VaultPreferences["defaultInsertMode"];
    clipboardWarningEnabled?: boolean;
    theme?: VaultPreferences["theme"];
    telemetryEnabled?: boolean;
}): Promise<StatusResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "vault/updatePreferences",
            source: "popup",
            target: "background",
            payload
        })
    )) as StatusResponse;
}

async function getActiveTabId(): Promise<number | undefined> {
    const tabs = await chrome.tabs.query({ active: true, windowType: "normal" });
    const tabId = tabs[0]?.id;
    return typeof tabId === "number" ? tabId : undefined;
}

async function copyTextFromPopup(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copied;
    }
}

export function isVaultExportFile(value: unknown): value is VaultExportFile {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<VaultExportFile>;
    return candidate.formatVersion === 1 && typeof candidate.exportedAt === "string" && typeof candidate.envelope === "object";
}

async function readImportFile(file: File): Promise<VaultExportFile> {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as unknown;

    if (!isVaultExportFile(parsed)) {
        throw new Error("Invalid export file format");
    }

    return parsed;
}

function getRemainingLockSeconds(status: PopupStatus, nowMs: number): number | null {
    if (!status.hasVault || status.locked) {
        return null;
    }

    const autoLockMinutes = status.preferences?.autoLockMinutes ?? 1;
    const anchorIso = status.lastMessageAt ?? status.lastUnlockedAt;
    const anchorMs = anchorIso ? Date.parse(anchorIso) : Number.NaN;

    if (!Number.isFinite(anchorMs)) {
        return null;
    }

    const deadlineMs = anchorMs + (autoLockMinutes * 60 * 1000);
    return Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
}

function GearIcon(props: { title: string }) {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-label={props.title} role="img" focusable="false">
            <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.1 7.1 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42L9.19 5.3c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.65 8.82a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.51.4 1.06.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z"
                fill="currentColor"
            />
        </svg>
    );
}

function LockIcon(props: { title: string }) {
    return (
        <svg viewBox="0 0 24 24" width="24" height="24" aria-label={props.title} role="img" focusable="false">
            <path
                d="M17 10h-1V8a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-7-2a2 2 0 114 0v2h-4V8zm2 8a1.5 1.5 0 011.5 1.5c0 .6-.35 1.12-.85 1.36V20h-1.3v-1.14a1.5 1.5 0 01.65-2.86z"
                fill="currentColor"
            />
        </svg>
    );
}

function UnlockIcon(props: { title: string }) {
    return (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-label={props.title} role="img" focusable="false">
            <path
                d="M17 8h-1V6a4 4 0 10-8 0h2a2 2 0 114 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-5 9a1.5 1.5 0 111.5-1.5A1.5 1.5 0 0112 17z"
                fill="currentColor"
            />
        </svg>
    );
}

export function Popup() {
    const [status, setStatus] = React.useState<PopupStatus>({
        installedAt: null,
        locked: true,
        hasVault: false,
        lastMessageAt: null,
        lastUserTrigger: null,
        lastUnlockedAt: null,
        preferences: null
    });
    const [error, setError] = React.useState<string | null>(null);
    const [summary, setSummary] = React.useState<string | null>(null);
    const [masterPassword, setMasterPassword] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [entries, setEntries] = React.useState<VaultEntry[]>([]);
    const [entryFilters, setEntryFilters] = React.useState({ query: "", favoritesOnly: false });
    const [firstLaunchChoice, setFirstLaunchChoice] = React.useState<"create" | "import">("create");
    const [importMode, setImportMode] = React.useState<"replace" | "merge">("replace");
    const [importPassword, setImportPassword] = React.useState("");
    const [importFile, setImportFile] = React.useState<VaultExportFile | null>(null);
    const [importFileName, setImportFileName] = React.useState<string | null>(null);
    const [nowMs, setNowMs] = React.useState(() => Date.now());
    const importFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const autoLockTriggeredRef = React.useRef(false);

    const refreshStatus = React.useCallback(async () => {
        const response = await sendMessage("vault/getStatus", {});

        if (!response.ok || !response.state) {
            setError(response.error ?? "Unable to load status");
            return;
        }

        setStatus(response.state);
        setError(null);
    }, []);

    React.useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    const runAction = React.useCallback(
        async (action: Exclude<Action, "vault/getStatus">) => {
            setBusy(true);

            const payload = action === "vault/lock" ? { reason: "manual" } : { masterPassword };
            const response = await sendMessage(action, payload);

            if (!response.ok) {
                setError(response.error ?? "Request failed");
                setBusy(false);
                return;
            }

            setMasterPassword("");
            setError(null);
            setSummary(null);
            await refreshStatus();

            if (action === "vault/create") {
                void chrome.runtime.openOptionsPage();
            }

            setBusy(false);
        },
        [masterPassword, refreshStatus]
    );

    const loadEntries = React.useCallback(async () => {
        if (!status.hasVault || status.locked) {
            setEntries([]);
            return;
        }

        const response = await listEntriesMessage({
            query: entryFilters.query.trim() || undefined,
            favoritesOnly: entryFilters.favoritesOnly
        });

        if (!response.ok || !response.entries) {
            setError(response.error ?? "Unable to list entries");
            return;
        }

        setEntries(response.entries);
    }, [entryFilters.favoritesOnly, entryFilters.query, status.hasVault, status.locked]);

    React.useEffect(() => {
        void loadEntries();
    }, [loadEntries]);

    React.useEffect(() => {
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    const selectImportFile = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0];

        if (!selected) {
            setImportFile(null);
            setImportFileName(null);
            return;
        }

        try {
            const parsed = await readImportFile(selected);
            setImportFile(parsed);
            setImportFileName(selected.name);
            setError(null);
        } catch {
            setImportFile(null);
            setImportFileName(null);
            setError("Selected file is not a valid encrypted vault export");
        }
    }, []);

    const importExistingVault = React.useCallback(async () => {
        if (!importFile) {
            setError("Select a vault export file before importing");
            return;
        }

        if (importPassword.trim().length === 0) {
            setError("Master password is required for import");
            return;
        }

        setBusy(true);
        const importMasterPassword = importPassword;
        const response = await importVaultMessage({
            file: importFile,
            masterPassword: importMasterPassword,
            mode: importMode
        });

        if (!response.ok) {
            setError(getVaultImportErrorMessage(response.error));
            setSummary(null);
            setBusy(false);
            return;
        }

        const unlockResponse = await sendMessage("vault/unlock", { masterPassword: importMasterPassword });
        if (!unlockResponse.ok) {
            setError(unlockResponse.error ?? "Imported vault, but failed to unlock");
            setSummary(null);
            setBusy(false);
            return;
        }

        const preferencesResponse = await updatePreferencesMessage({ autoLockMinutes: 1 });
        if (!preferencesResponse.ok) {
            setError(preferencesResponse.error ?? "Imported and unlocked vault, but failed to apply default lock timer");
            setSummary(null);
            setBusy(false);
            return;
        }

        setError(null);
        setSummary(`Imported ${response.entryCount ?? 0} entries and unlocked vault`);
        setImportPassword("");
        setImportFile(null);
        setImportFileName(null);
        if (importFileInputRef.current) {
            importFileInputRef.current.value = "";
        }
        await refreshStatus();
        setBusy(false);
    }, [importFile, importMode, importPassword, refreshStatus]);

    const triggerEntry = React.useCallback(async (entryId: string) => {
        setBusy(true);

        const preferClipboard = status.preferences?.defaultInsertMode === "copy";
        if (preferClipboard) {
            const selectedEntry = entries.find((entry) => entry.id === entryId);

            if (!selectedEntry) {
                setError("Unable to find selected entry");
                setSummary(null);
                setBusy(false);
                return;
            }

            if (!selectedEntry.copyModeAllowed) {
                setError("Copy mode is disabled for this entry");
                setSummary(null);
                setBusy(false);
                return;
            }

            const copied = await copyTextFromPopup(selectedEntry.value);
            if (!copied) {
                setError("Unable to copy entry value");
                setSummary(null);
                setBusy(false);
                return;
            }

            setError(null);
            setSummary("Copied entry value to clipboard");
            setBusy(false);
            return;
        }

        const tabId = await getActiveTabId();
        const response = await insertEntryMessage({ entryId, tabId, fallbackToClipboard: preferClipboard || undefined });

        if (!response.ok) {
            setError(response.error ?? "Unable to apply entry");
            setSummary(null);
            setBusy(false);
            return;
        }

        setError(null);
        setSummary(response.insertionMode === "clipboard" ? "Copied entry value to clipboard" : "Inserted entry value");
        await refreshStatus();
        setBusy(false);
    }, [entries, refreshStatus, status.preferences?.defaultInsertMode]);

    const openOptions = React.useCallback(() => {
        void chrome.runtime.openOptionsPage();
    }, []);

    const remainingLockSeconds = getRemainingLockSeconds(status, nowMs);

    React.useEffect(() => {
        if (!status.hasVault || status.locked || remainingLockSeconds === null) {
            autoLockTriggeredRef.current = false;
            return;
        }

        if (remainingLockSeconds > 0) {
            autoLockTriggeredRef.current = false;
            return;
        }

        if (autoLockTriggeredRef.current) {
            return;
        }

        autoLockTriggeredRef.current = true;
        void (async () => {
            setBusy(true);
            const response = await sendMessage("vault/lock", { reason: "manual" });

            if (!response.ok) {
                setError(response.error ?? "Unable to auto-lock vault");
                autoLockTriggeredRef.current = false;
                setBusy(false);
                return;
            }

            setError(null);
            setSummary(null);
            await refreshStatus();
            setBusy(false);
        })();
    }, [refreshStatus, remainingLockSeconds, status.hasVault, status.locked]);

    return (
        <main className="popup-shell">
            <style>{`
                :root {
                    font-family: "Trebuchet MS", "Gill Sans", "Segoe UI", sans-serif;
                    color: #102a43;
                }
                body {
                    margin: 0;
                    min-width: 420px;
                    background:
                        radial-gradient(circle at 80% 0%, #ffe8d1 0%, transparent 45%),
                        linear-gradient(180deg, #fdf7ef 0%, #f4f8fc 100%);
                }
                .popup-shell {
                    padding: 14px;
                    display: grid;
                    gap: 12px;
                }
                .card {
                    border: 1px solid #d7e2ee;
                    border-radius: 14px;
                    background: #ffffffd9;
                    box-shadow: 0 8px 20px rgba(16, 42, 67, 0.08);
                    padding: 12px;
                    display: grid;
                    gap: 8px;
                }
                h1 {
                    margin: 0;
                    font-size: 1.2rem;
                    letter-spacing: 0.02em;
                }
                h2 {
                    margin: 0;
                    font-size: 1rem;
                }
                p {
                    margin: 0;
                }
                label {
                    display: grid;
                    gap: 5px;
                    font-size: 0.9rem;
                    font-weight: 600;
                }
                input {
                    border: 1px solid #b4c6d8;
                    border-radius: 8px;
                    padding: 8px;
                    font: inherit;
                    color: #102a43;
                }
                .muted {
                    color: #627d98;
                    font-size: 0.85rem;
                }
                .row {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                button {
                    border-radius: 8px;
                    border: 1px solid #0b6e4f;
                    background: #0b6e4f;
                    color: #fff;
                    padding: 7px 10px;
                    font: inherit;
                    font-size: 0.86rem;
                    cursor: pointer;
                }
                button.secondary {
                    background: #fff;
                    color: #0b6e4f;
                }
                button.icon-only {
                    width: 40px;
                    height: 36px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                button.warn {
                    border-color: #b42318;
                    background: #b42318;
                }
                button:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                }
                .status-pill {
                    border: 1px solid #d1e9dd;
                    border-radius: 99px;
                    padding: 2px 8px;
                    background: #ecfdf3;
                    color: #067647;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .countdown {
                    color: #9a3412;
                    font-size: 0.85rem;
                    font-weight: 700;
                }
                .lock-button-label {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .locked-hero {
                    position: relative;
                    min-height: 210px;
                    border-radius: 12px;
                    border: 1px solid #d7e2ee;
                    background:
                        radial-gradient(circle at 50% 30%, #f3f8fc 0%, #ffffff 70%),
                        linear-gradient(180deg, #ffffff 0%, #f6fafc 100%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                }
                .locked-hero .lock-bg {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6e8ea8;
                    opacity: 0.42;
                    filter: blur(3px);
                    pointer-events: none;
                }
                .locked-hero .lock-bg svg {
                    width: 180px;
                    height: 180px;
                }
                .locked-hero .unlock-input {
                    position: relative;
                    z-index: 1;
                    width: min(320px, calc(100% - 28px));
                    border: 1px solid #8da6bb;
                    background: #ffffffea;
                    box-shadow: 0 10px 24px rgba(16, 42, 67, 0.12);
                    border-radius: 12px;
                    padding: 12px 14px;
                    text-align: center;
                    font-size: 1rem;
                }
                .unlock-form {
                    position: relative;
                    z-index: 1;
                    width: min(320px, calc(100% - 28px));
                    display: grid;
                    gap: 10px;
                    justify-items: center;
                }
                .unlock-button {
                    display: inline-flex;
                    align-items: center;
                    border-radius: 999px;
                    width: 36px;
                    height: 36px;
                    justify-content: center;
                    padding: 0;
                }
                .entry-pill-grid {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .entry-pill {
                    border-radius: 999px;
                    border: 1px solid #b7cedf;
                    background: #f3f8fc;
                    color: #102a43;
                    padding: 7px 11px;
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    max-width: 100%;
                }
                .entry-pill-label {
                    font-weight: 700;
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .entry-pill-preview {
                    color: #627d98;
                    font-size: 0.78rem;
                    max-width: 115px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .inline-options-link {
                    display: inline-flex;
                    vertical-align: middle;
                    margin-left: 4px;
                }
                .inline-options-link button {
                    border-radius: 999px;
                    border: 1px solid #b7cedf;
                    background: #fff;
                    color: #0b6e4f;
                    width: 22px;
                    height: 22px;
                    padding: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .alert {
                    border-radius: 8px;
                    border: 1px solid #f5c2c7;
                    background: #fff1f3;
                    color: #842029;
                    padding: 8px;
                    font-size: 0.85rem;
                }
                .ok {
                    border-radius: 8px;
                    border: 1px solid #b7ebc6;
                    background: #ecfdf3;
                    color: #067647;
                    padding: 8px;
                    font-size: 0.85rem;
                }
                .launch-choice {
                    display: inline-flex;
                    gap: 6px;
                    border: 1px solid #d7e2ee;
                    border-radius: 999px;
                    padding: 4px;
                    background: #f8fbff;
                }
                .launch-choice button {
                    border-radius: 999px;
                    padding: 5px 10px;
                    border: 1px solid transparent;
                    background: transparent;
                    color: #486581;
                }
                .launch-choice button.active {
                    background: #0b6e4f;
                    color: #fff;
                }
                select {
                    border: 1px solid #b4c6d8;
                    border-radius: 8px;
                    padding: 8px;
                    font: inherit;
                    color: #102a43;
                    background: #fff;
                }
            `}</style>

            <section className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                    <h1>Encrypted ID Vault</h1>
                    {status.hasVault && !status.locked ? (
                        <div className="row">
                            <button type="button" className="secondary" onClick={() => void refreshStatus()} disabled={busy}>Refresh</button>
                            <button type="button" className="secondary icon-only" onClick={openOptions} title="Options" aria-label="Options">
                                <GearIcon title="Options" />
                            </button>
                        </div>
                    ) : null}
                </div>
                {!status.locked ? (
                    <div className="row">
                        <span className={remainingLockSeconds !== null ? "countdown" : "muted"}>
                            {remainingLockSeconds !== null ? `Auto-locking vault in ${remainingLockSeconds} seconds` : (status.hasVault ? "Vault ready" : "No vault yet")}
                        </span>
                    </div>
                ) : null}
                {!status.hasVault ? <p className="muted">First launch: create a new vault or import an existing encrypted vault file.</p> : null}

                {!status.hasVault ? (
                    <>
                        <div className="launch-choice" role="tablist" aria-label="First launch options">
                            <button
                                type="button"
                                className={firstLaunchChoice === "create" ? "active" : ""}
                                onClick={() => setFirstLaunchChoice("create")}
                            >
                                Create new
                            </button>
                            <button
                                type="button"
                                className={firstLaunchChoice === "import" ? "active" : ""}
                                onClick={() => setFirstLaunchChoice("import")}
                            >
                                Import existing
                            </button>
                        </div>

                        {firstLaunchChoice === "create" ? (
                            <>
                                <label>
                                    Master password
                                    <input
                                        type="password"
                                        value={masterPassword}
                                        minLength={8}
                                        onChange={(event) => setMasterPassword(event.target.value)}
                                        placeholder="Enter master password"
                                    />
                                </label>
                                <div className="row">
                                    <button type="button" disabled={busy || masterPassword.trim().length < 8} onClick={() => void runAction("vault/create")}>Create vault</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <label>
                                    Import mode
                                    <select value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
                                        <option value="replace">Replace (recommended for first launch)</option>
                                        <option value="merge">Merge</option>
                                    </select>
                                </label>
                                <label>
                                    Vault file
                                    <input
                                        ref={importFileInputRef}
                                        type="file"
                                        accept=".json,.enc.json,application/json"
                                        onChange={(event) => void selectImportFile(event)}
                                    />
                                </label>
                                {importFileName ? <p className="muted">Selected file: {importFileName}</p> : null}
                                <label>
                                    Master password for imported vault
                                    <input
                                        type="password"
                                        value={importPassword}
                                        onChange={(event) => setImportPassword(event.target.value)}
                                        placeholder="Enter imported vault password"
                                    />
                                </label>
                                <div className="row">
                                    <button type="button" disabled={busy || !importFile || importPassword.trim().length === 0} onClick={() => void importExistingVault()}>Import vault</button>
                                </div>
                            </>
                        )}
                    </>
                ) : status.locked ? (
                    <>
                        <div className="locked-hero" aria-label="Locked vault unlock view">
                            <div className="lock-bg" aria-hidden="true">
                                <LockIcon title="Locked" />
                            </div>
                            <div className="unlock-form">
                                <input
                                    className="unlock-input"
                                    type="password"
                                    value={masterPassword}
                                    minLength={8}
                                    onChange={(event) => setMasterPassword(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !busy && masterPassword.trim().length > 0) {
                                            event.preventDefault();
                                            void runAction("vault/unlock");
                                        }
                                    }}
                                    placeholder="Enter master password"
                                />
                                <button
                                    type="button"
                                    className="unlock-button"
                                    disabled={busy || masterPassword.trim().length === 0}
                                    onClick={() => void runAction("vault/unlock")}
                                    title="Unlock vault"
                                    aria-label="Unlock vault"
                                >
                                    <UnlockIcon title="Unlock" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="row">
                        <button type="button" className="warn" disabled={busy} onClick={() => void runAction("vault/lock")}> 
                            <span className="lock-button-label">
                                <LockIcon title="Lock vault" />
                                Lock vault
                            </span>
                        </button>
                    </div>
                )}
            </section>

            {status.hasVault && !status.locked ? (
                <section className="card">
                    <h2>Entries</h2>
                    <label>
                        Search entries
                        <input
                            type="text"
                            value={entryFilters.query}
                            onChange={(event) => setEntryFilters((current) => ({ ...current, query: event.target.value }))}
                            placeholder="Label, category, or notes"
                        />
                    </label>
                    <label className="row" style={{ fontWeight: 500 }}>
                        <input
                            type="checkbox"
                            checked={entryFilters.favoritesOnly}
                            onChange={(event) => setEntryFilters((current) => ({ ...current, favoritesOnly: event.target.checked }))}
                        />
                        Favorites only
                    </label>

                    <p className="muted">
                        Click to Copy. Manage entries in options
                        <span className="inline-options-link">
                            <button type="button" onClick={openOptions} title="Options" aria-label="Options">
                                <GearIcon title="Options" />
                            </button>
                        </span>
                    </p>

                    {entries.length === 0 ? <p className="muted">No entries yet.</p> : null}
                    <div className="entry-pill-grid">
                        {entries.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                className="entry-pill"
                                disabled={busy}
                                onClick={() => void triggerEntry(entry.id)}
                                title={`${entry.label} (${entry.category})`}
                            >
                                <span className="entry-pill-label">{entry.label}</span>
                                <span className="entry-pill-preview">{entry.maskedPreview}</span>
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}

            {summary ? <p className="ok">{summary}</p> : null}
            {error ? <p role="alert" className="alert">{error}</p> : null}
        </main>
    );
}
