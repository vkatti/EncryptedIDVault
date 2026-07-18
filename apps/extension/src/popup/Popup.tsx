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

type PreferencesResponse = {
    ok: boolean;
    preferences?: VaultPreferences | null;
    error?: string;
};

type EntryListResponse = {
    ok: boolean;
    entries?: VaultEntry[];
    error?: string;
};

type EntryMutationResponse = {
    ok: boolean;
    entry?: VaultEntry;
    deletedEntryId?: string;
    error?: string;
};

type InsertResponse = {
    ok: boolean;
    insertedEntryId?: string;
    insertionMode?: "insert" | "clipboard";
    error?: string;
};

type VaultExportResponse = {
    ok: boolean;
    file?: VaultExportFile;
    error?: string;
};

type VaultImportResponse = {
    ok: boolean;
    mode?: "replace" | "merge";
    entryCount?: number;
    error?: string;
};

type Action = "vault/getStatus" | "vault/create" | "vault/unlock" | "vault/lock";

type EntryFormState = {
    label: string;
    value: string;
    category: string;
    notes: string;
    favorite: boolean;
};

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

async function updateEntryMessage(payload: {
    entryId: string;
    label?: string;
    value?: string;
    category?: string;
    notes?: string;
    favorite?: boolean;
}): Promise<EntryMutationResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "entries/update",
            source: "popup",
            target: "background",
            payload
        })
    )) as EntryMutationResponse;
}

async function deleteEntryMessage(payload: { entryId: string }): Promise<EntryMutationResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "entries/delete",
            source: "popup",
            target: "background",
            payload
        })
    )) as EntryMutationResponse;
}

async function reorderEntryMessage(payload: { entryId: string; targetIndex: number }): Promise<EntryMutationResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "entries/reorder",
            source: "popup",
            target: "background",
            payload
        })
    )) as EntryMutationResponse;
}

async function insertEntryMessage(payload: { entryId: string; tabId?: number }): Promise<InsertResponse> {
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

async function getActiveTabId(): Promise<number | undefined> {
    const tabs = await chrome.tabs.query({ active: true, windowType: "normal" });
    const tabId = tabs[0]?.id;
    return typeof tabId === "number" ? tabId : undefined;
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

function downloadVaultFile(file: VaultExportFile): void {
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = file.exportedAt.replace(/[:.]/g, "-");

    link.href = objectUrl;
    link.download = `vault-${timestamp}.enc.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
}

const DEFAULT_ENTRY_FORM: EntryFormState = {
    label: "",
    value: "",
    category: "",
    notes: "",
    favorite: false
};

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
    const [masterPassword, setMasterPassword] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [entries, setEntries] = React.useState<VaultEntry[]>([]);
    const [entryFilters, setEntryFilters] = React.useState({ query: "", favoritesOnly: false });
    const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
    const [editingEntry, setEditingEntry] = React.useState<EntryFormState>(DEFAULT_ENTRY_FORM);
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

    const startEditingEntry = React.useCallback((entry: VaultEntry) => {
        setEditingEntryId(entry.id);
        setEditingEntry({
            label: entry.label,
            value: entry.value,
            category: entry.category,
            notes: entry.notes ?? "",
            favorite: entry.favorite
        });
    }, []);

    const cancelEditingEntry = React.useCallback(() => {
        setEditingEntryId(null);
        setEditingEntry(DEFAULT_ENTRY_FORM);
    }, []);

    const saveEditedEntry = React.useCallback(async () => {
        if (!editingEntryId) {
            return;
        }

        if (editingEntry.label.trim().length === 0 || editingEntry.value.trim().length === 0 || editingEntry.category.trim().length === 0) {
            setError("Label, value, and category are required");
            return;
        }

        setBusy(true);
        const response = await updateEntryMessage({
            entryId: editingEntryId,
            label: editingEntry.label.trim(),
            value: editingEntry.value,
            category: editingEntry.category.trim(),
            notes: editingEntry.notes.trim() || undefined,
            favorite: editingEntry.favorite
        });

        if (!response.ok) {
            setError(response.error ?? "Unable to update entry");
            setBusy(false);
            return;
        }

        setError(null);
        cancelEditingEntry();
        await loadEntries();
        setBusy(false);
    }, [cancelEditingEntry, editingEntry, editingEntryId, loadEntries]);

    const deleteEntry = React.useCallback(async (entryId: string) => {
        setBusy(true);
        const response = await deleteEntryMessage({ entryId });

        if (!response.ok) {
            setError(response.error ?? "Unable to delete entry");
            setBusy(false);
            return;
        }

        if (editingEntryId === entryId) {
            cancelEditingEntry();
        }

        setError(null);
        await loadEntries();
        setBusy(false);
    }, [cancelEditingEntry, editingEntryId, loadEntries]);

    const moveEntry = React.useCallback(async (entryId: string, targetIndex: number) => {
        setBusy(true);
        const response = await reorderEntryMessage({ entryId, targetIndex });

        if (!response.ok) {
            setError(response.error ?? "Unable to reorder entry");
            setBusy(false);
            return;
        }

        setError(null);
        await loadEntries();
        setBusy(false);
    }, [loadEntries]);

    const insertEntry = React.useCallback(async (entryId: string) => {
        setBusy(true);
        const tabId = await getActiveTabId();
        const response = await insertEntryMessage({ entryId, tabId });

        if (!response.ok) {
            setError(response.error ?? "Unable to insert entry");
            setBusy(false);
            return;
        }

        setError(null);
        await refreshStatus();
        setBusy(false);
    }, [refreshStatus]);

    const openOptions = React.useCallback(() => {
        void chrome.runtime.openOptionsPage();
    }, []);

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
                h3 {
                    margin: 0;
                    font-size: 0.92rem;
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
                .entry-actions {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
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
                .entry {
                    border: 1px solid #d7e2ee;
                    border-radius: 10px;
                    background: #f9fbff;
                    padding: 10px;
                    display: grid;
                    gap: 7px;
                }
                .entry-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 8px;
                    align-items: baseline;
                }
                .pill {
                    border: 1px solid #d1e9dd;
                    border-radius: 99px;
                    padding: 2px 8px;
                    background: #ecfdf3;
                    color: #067647;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .alert {
                    border-radius: 8px;
                    border: 1px solid #f5c2c7;
                    background: #fff1f3;
                    color: #842029;
                    padding: 8px;
                    font-size: 0.85rem;
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
                    <span className="pill">{status.locked ? "Locked" : "Unlocked"}</span>
                    <span className="muted">{status.hasVault ? "Vault ready" : "No vault yet"}</span>
                </div>
                {!status.hasVault ? <p className="muted">Create your vault to start storing entries. Advanced settings are in Options.</p> : null}
                {status.hasVault && status.locked ? <p className="muted">Unlock to use your entries in this tab.</p> : null}

                {!status.hasVault || status.locked ? (
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
                            {!status.hasVault ? (
                                <button type="button" disabled={busy || masterPassword.trim().length < 8} onClick={() => void runAction("vault/create")}>Create vault</button>
                            ) : null}
                            {status.hasVault && status.locked ? (
                                <button type="button" disabled={busy || masterPassword.trim().length === 0} onClick={() => void runAction("vault/unlock")}>Unlock vault</button>
                            ) : null}
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

                    <p className="muted">Create new entries from Options to Entry manager.</p>

                    <h3>Entry list</h3>
                    {entries.length === 0 ? <p className="muted">No entries yet.</p> : null}
                    {entries.map((entry, index) => (
                        <article key={entry.id} className="entry">
                            <div className="entry-header">
                                <strong>{entry.label}</strong>
                                <span className="muted">{entry.category}</span>
                            </div>
                            <p className="muted">Preview: {entry.maskedPreview}</p>

                            {editingEntryId === entry.id ? (
                                <>
                                    <label>
                                        Label
                                        <input
                                            type="text"
                                            value={editingEntry.label}
                                            onChange={(event) => setEditingEntry((current) => ({ ...current, label: event.target.value }))}
                                        />
                                    </label>
                                    <label>
                                        Value
                                        <input
                                            type="text"
                                            value={editingEntry.value}
                                            onChange={(event) => setEditingEntry((current) => ({ ...current, value: event.target.value }))}
                                        />
                                    </label>
                                    <label>
                                        Category
                                        <input
                                            type="text"
                                            value={editingEntry.category}
                                            onChange={(event) => setEditingEntry((current) => ({ ...current, category: event.target.value }))}
                                        />
                                    </label>
                                    <label>
                                        Notes
                                        <input
                                            type="text"
                                            value={editingEntry.notes}
                                            onChange={(event) => setEditingEntry((current) => ({ ...current, notes: event.target.value }))}
                                        />
                                    </label>
                                    <label className="row" style={{ fontWeight: 500 }}>
                                        <input
                                            type="checkbox"
                                            checked={editingEntry.favorite}
                                            onChange={(event) => setEditingEntry((current) => ({ ...current, favorite: event.target.checked }))}
                                        />
                                        Favorite
                                    </label>
                                    <div className="entry-actions">
                                        <button type="button" disabled={busy} onClick={() => void saveEditedEntry()}>Save</button>
                                        <button type="button" className="secondary" disabled={busy} onClick={cancelEditingEntry}>Cancel</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {entry.notes ? <p className="muted">Notes: {entry.notes}</p> : null}
                                    <p className="muted">Favorite: {entry.favorite ? "yes" : "no"}</p>
                                    <div className="entry-actions">
                                        <button type="button" className="secondary" disabled={busy} onClick={() => startEditingEntry(entry)}>Edit</button>
                                        <button type="button" disabled={busy} onClick={() => void insertEntry(entry.id)}>Insert</button>
                                        <button type="button" className="secondary" disabled={busy || index === 0} onClick={() => void moveEntry(entry.id, index - 1)}>Up</button>
                                        <button type="button" className="secondary" disabled={busy || index === entries.length - 1} onClick={() => void moveEntry(entry.id, index + 1)}>Down</button>
                                        <button type="button" className="warn" disabled={busy} onClick={() => void deleteEntry(entry.id)}>Delete</button>
                                    </div>
                                </>
                            )}
                        </article>
                    ))}
                </section>
            ) : null}

            {error ? <p role="alert" className="alert">{error}</p> : null}
        </main>
    );
}
