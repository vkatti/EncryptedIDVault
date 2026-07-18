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

function getPasswordStrength(password: string): "weak" | "medium" | "strong" {
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const score = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

    if (password.length >= 14 && score >= 3) {
        return "strong";
    }

    if (password.length >= 10 && score >= 2) {
        return "medium";
    }

    return "weak";
}

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
    const importFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const passwordStrength = getPasswordStrength(masterPassword);

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

    const defaultModeLabel = status.preferences?.defaultInsertMode === "copy" ? "copy" : "insert";

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
                    <div className="row">
                        <button type="button" className="secondary" onClick={() => void refreshStatus()} disabled={busy}>Refresh</button>
                        <button type="button" className="secondary" onClick={openOptions}>Open settings</button>
                    </div>
                </div>
                <div className="row">
                    <span className="status-pill">{status.locked ? "Locked" : "Unlocked"}</span>
                    <span className="muted">{status.hasVault ? "Vault ready" : "No vault yet"}</span>
                </div>
                {!status.hasVault ? <p className="muted">First launch: create a new vault or import an existing encrypted vault file.</p> : null}
                {status.hasVault && status.locked ? <p className="muted">Unlock to use your entries in this tab.</p> : null}

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
                                <p className="muted">Password strength: {passwordStrength}</p>
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
                        <p className="muted">Password strength: {passwordStrength}</p>
                        <div className="row">
                            <button type="button" disabled={busy || masterPassword.trim().length === 0} onClick={() => void runAction("vault/unlock")}>Unlock vault</button>
                        </div>
                    </>
                ) : (
                    <div className="row">
                        <button type="button" className="warn" disabled={busy} onClick={() => void runAction("vault/lock")}>Lock vault</button>
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

                    <p className="muted">Tap a pill to {defaultModeLabel}. Manage entries in Options.</p>

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
