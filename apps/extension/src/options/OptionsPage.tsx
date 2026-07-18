import React from "react";

import { createMessageEnvelope } from "@encrypted-id-vault/security";
import type { VaultEntry, VaultExportFile, VaultPreferences } from "@encrypted-id-vault/shared";
import { getVaultExportErrorMessage, getVaultImportErrorMessage, isVaultExportFile } from "../popup/Popup";

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
    state?: PopupStatus;
    error?: string;
};

type PreferencesResponse = {
    ok: boolean;
    preferences?: VaultPreferences | null;
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

type Action = "vault/getStatus" | "vault/create" | "vault/unlock" | "vault/lock";
type PreferenceField = keyof VaultPreferences;
type OptionsTab = "entry" | "lifecycle" | "preferences" | "backup";

type EntryFormState = {
    label: string;
    value: string;
    category: string;
    notes: string;
    favorite: boolean;
};

const DEFAULT_PREFERENCES: VaultPreferences = {
    autoLockMinutes: 5,
    defaultInsertMode: "insert",
    clipboardWarningEnabled: true,
    theme: "system",
    telemetryEnabled: false
};

const DEFAULT_ENTRY_FORM: EntryFormState = {
    label: "",
    value: "",
    category: "",
    notes: "",
    favorite: false
};

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

async function savePreferencesMessage(payload: VaultPreferences): Promise<PreferencesResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "vault/updatePreferences",
            source: "popup",
            target: "background",
            payload
        })
    )) as PreferencesResponse;
}

async function exportVaultMessage(): Promise<VaultExportResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "vault/export",
            source: "popup",
            target: "background",
            payload: {}
        })
    )) as VaultExportResponse;
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

async function createEntryMessage(payload: {
    label: string;
    value: string;
    category: string;
    notes?: string;
    favorite?: boolean;
}): Promise<EntryMutationResponse> {
    return (await chrome.runtime.sendMessage(
        createMessageEnvelope({
            id: crypto.randomUUID(),
            type: "entries/create",
            source: "popup",
            target: "background",
            payload
        })
    )) as EntryMutationResponse;
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

function getEntryMutationErrorMessage(errorCode?: string): string {
    switch (errorCode) {
        case "ERR_VAULT_LOCKED":
            return "Vault is locked. Unlock it from Vault lifecycle first.";
        default:
            return "Unable to save entry. Try again.";
    }
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

async function readImportFile(file: File): Promise<VaultExportFile> {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as unknown;

    if (!isVaultExportFile(parsed)) {
        throw new Error("Invalid export file format");
    }

    return parsed;
}

function Icon(props: { path: string; title: string }) {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-label={props.title} role="img" focusable="false">
            <path d={props.path} fill="currentColor" />
        </svg>
    );
}

const ICONS = {
    entry: "M19 3H5c-1.1 0-2 .9-2 2v14l4-3h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z",
    lifecycle: "M12 6V3L8 7l4 4V8c2.8 0 5 2.2 5 5a5 5 0 01-5 5 5 5 0 01-4.6-3H5.3A7 7 0 0012 20a7 7 0 000-14z",
    preferences: "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.1 7.1 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42L9.19 5.3c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.65 8.82a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.51.4 1.06.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z",
    backup: "M19 3H5c-1.1 0-2 .9-2 2v14h18V5c0-1.1-.9-2-2-2zm-1 14H6V7h12v10zm-6-1l4-4h-3V8h-2v4H8l4 4z",
    plus: "M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z",
    edit: "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    up: "M7 14l5-5 5 5z",
    down: "M7 10l5 5 5-5z",
    delete: "M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"
} as const;

export function OptionsPage() {
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
    const [busy, setBusy] = React.useState(false);
    const [masterPassword, setMasterPassword] = React.useState("");
    const [preferences, setPreferences] = React.useState<VaultPreferences>(DEFAULT_PREFERENCES);
    const [importMode, setImportMode] = React.useState<"replace" | "merge">("merge");
    const [importPassword, setImportPassword] = React.useState("");
    const [importFile, setImportFile] = React.useState<VaultExportFile | null>(null);
    const [importFileName, setImportFileName] = React.useState<string | null>(null);
    const [summary, setSummary] = React.useState<string | null>(null);
    const [activeTab, setActiveTab] = React.useState<OptionsTab>("entry");
    const [entries, setEntries] = React.useState<VaultEntry[]>([]);
    const [entryFilters, setEntryFilters] = React.useState({ query: "", favoritesOnly: false });
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [newEntry, setNewEntry] = React.useState<EntryFormState>(DEFAULT_ENTRY_FORM);
    const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
    const [editingEntry, setEditingEntry] = React.useState<EntryFormState>(DEFAULT_ENTRY_FORM);
    const importFileInputRef = React.useRef<HTMLInputElement | null>(null);

    const refreshStatus = React.useCallback(async () => {
        const response = await sendMessage("vault/getStatus", {});

        if (!response.ok || !response.state) {
            setError(response.error ?? "Unable to load status");
            return;
        }

        setStatus(response.state);
        if (response.state.preferences) {
            setPreferences(response.state.preferences);
        }
        setError(null);
    }, []);

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
        void refreshStatus();
    }, [refreshStatus]);

    React.useEffect(() => {
        void loadEntries();
    }, [loadEntries]);

    const runAction = React.useCallback(async (action: Exclude<Action, "vault/getStatus">) => {
        setBusy(true);
        const payload = action === "vault/lock" ? { reason: "manual" } : { masterPassword };
        const response = await sendMessage(action, payload);

        if (!response.ok) {
            setError(response.error ?? "Request failed");
            setBusy(false);
            return;
        }

        setError(null);
        setSummary(`${action} completed`);
        setMasterPassword("");
        await refreshStatus();
        await loadEntries();
        setBusy(false);
    }, [masterPassword, refreshStatus, loadEntries]);

    const updatePreference = React.useCallback(<K extends PreferenceField>(field: K, value: VaultPreferences[K]) => {
        setPreferences((current) => ({
            ...current,
            [field]: value
        }));
    }, []);

    const savePreferences = React.useCallback(async () => {
        setBusy(true);
        const response = await savePreferencesMessage(preferences);

        if (!response.ok) {
            setError(response.error ?? "Unable to save preferences");
            setBusy(false);
            return;
        }

        setError(null);
        setSummary("Preferences saved");
        await refreshStatus();
        setBusy(false);
    }, [preferences, refreshStatus]);

    const exportVault = React.useCallback(async () => {
        setBusy(true);
        const response = await exportVaultMessage();

        if (!response.ok || !response.file) {
            setError(getVaultExportErrorMessage(response.error));
            setBusy(false);
            return;
        }

        downloadVaultFile(response.file);
        setError(null);
        setSummary(`Exported vault at ${response.file.exportedAt}`);
        setBusy(false);
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

    const importVault = React.useCallback(async () => {
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
            setBusy(false);
            return;
        }

        const unlockResponse = await sendMessage("vault/unlock", { masterPassword: importMasterPassword });
        if (!unlockResponse.ok) {
            setError(unlockResponse.error ?? "Imported vault, but failed to unlock");
            setBusy(false);
            return;
        }

        setError(null);
        setSummary(`Imported ${response.entryCount ?? 0} entries using ${response.mode ?? importMode} mode and unlocked vault`);
        setImportPassword("");
        setImportFile(null);
        setImportFileName(null);
        if (importFileInputRef.current) {
            importFileInputRef.current.value = "";
        }

        await refreshStatus();
        await loadEntries();
        setBusy(false);
    }, [importFile, importMode, importPassword, refreshStatus, loadEntries]);

    const openCreateModal = React.useCallback(() => {
        setNewEntry(DEFAULT_ENTRY_FORM);
        setShowCreateModal(true);
    }, []);

    const closeCreateModal = React.useCallback(() => {
        setShowCreateModal(false);
        setNewEntry(DEFAULT_ENTRY_FORM);
    }, []);

    const createEntry = React.useCallback(async () => {
        if (status.locked) {
            setError("Vault is locked. Unlock it from Vault lifecycle first.");
            return;
        }

        if (newEntry.label.trim().length === 0 || newEntry.value.trim().length === 0 || newEntry.category.trim().length === 0) {
            setError("Label, value, and category are required");
            return;
        }

        setBusy(true);
        const response = await createEntryMessage({
            label: newEntry.label.trim(),
            value: newEntry.value,
            category: newEntry.category.trim(),
            notes: newEntry.notes.trim() || undefined,
            favorite: newEntry.favorite
        });

        if (!response.ok) {
            setError(getEntryMutationErrorMessage(response.error));
            setBusy(false);
            return;
        }

        setError(null);
        setSummary("Entry created");
        closeCreateModal();
        await loadEntries();
        setBusy(false);
    }, [closeCreateModal, loadEntries, newEntry, status.locked]);

    const beginEditEntry = React.useCallback((entry: VaultEntry) => {
        setEditingEntryId(entry.id);
        setEditingEntry({
            label: entry.label,
            value: entry.value,
            category: entry.category,
            notes: entry.notes ?? "",
            favorite: entry.favorite
        });
    }, []);

    const cancelEditEntry = React.useCallback(() => {
        setEditingEntryId(null);
        setEditingEntry(DEFAULT_ENTRY_FORM);
    }, []);

    const saveEditEntry = React.useCallback(async () => {
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
            setError(getEntryMutationErrorMessage(response.error));
            setBusy(false);
            return;
        }

        setError(null);
        setSummary("Entry updated");
        cancelEditEntry();
        await loadEntries();
        setBusy(false);
    }, [cancelEditEntry, editingEntry, editingEntryId, loadEntries]);

    const deleteEntry = React.useCallback(async (entryId: string) => {
        setBusy(true);
        const response = await deleteEntryMessage({ entryId });

        if (!response.ok) {
            setError(response.error ?? "Unable to delete entry");
            setBusy(false);
            return;
        }

        if (editingEntryId === entryId) {
            cancelEditEntry();
        }

        setError(null);
        setSummary("Entry deleted");
        await loadEntries();
        setBusy(false);
    }, [cancelEditEntry, editingEntryId, loadEntries]);

    const moveEntry = React.useCallback(async (entryId: string, targetIndex: number) => {
        setBusy(true);
        const response = await reorderEntryMessage({ entryId, targetIndex });

        if (!response.ok) {
            setError(response.error ?? "Unable to reorder entry");
            setBusy(false);
            return;
        }

        setError(null);
        setSummary("Entry order updated");
        await loadEntries();
        setBusy(false);
    }, [loadEntries]);

    return (
        <main className="options-shell">
            <style>{`
                :root {
                    --ink: #0d2b45;
                    --muted: #58708a;
                    --line: #d7e2ee;
                    --brand: #0f7a5f;
                    --brand-strong: #095946;
                    --danger: #be2718;
                    --surface: #ffffff;
                }
                body {
                    margin: 0;
                    background:
                        radial-gradient(circle at 100% 0%, #ffe7cc 0%, transparent 34%),
                        linear-gradient(180deg, #f3f7fb 0%, #eaf1f8 100%);
                    color: var(--ink);
                    font-family: "Trebuchet MS", "Gill Sans", "Segoe UI", sans-serif;
                }
                .options-shell {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 20px;
                    display: grid;
                    gap: 14px;
                }
                .hero {
                    background: linear-gradient(135deg, #08355a 0%, #0f7a5f 100%);
                    color: #fff;
                    border-radius: 18px;
                    padding: 16px;
                    box-shadow: 0 14px 30px rgba(13, 43, 69, 0.25);
                }
                .hero h1 {
                    margin: 0;
                    font-size: 2rem;
                }
                .hero p {
                    margin: 8px 0 0;
                    color: rgba(255, 255, 255, 0.9);
                }
                .tabs {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .tab {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    border-radius: 999px;
                    border: 1px solid var(--line);
                    padding: 7px 12px;
                    background: #fff;
                    color: #1f4a6b;
                    cursor: pointer;
                    font: inherit;
                    font-weight: 700;
                }
                .tab.active {
                    background: var(--ink);
                    color: #fff;
                    border-color: var(--ink);
                }
                .card {
                    border: 1px solid var(--line);
                    border-radius: 16px;
                    background: var(--surface);
                    padding: 14px;
                    box-shadow: 0 8px 24px rgba(13, 43, 69, 0.08);
                    display: grid;
                    gap: 10px;
                }
                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .control-row {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                input, select {
                    border: 1px solid #b8c9db;
                    border-radius: 10px;
                    padding: 9px 10px;
                    font: inherit;
                    color: var(--ink);
                    background: #fff;
                }
                .search {
                    min-width: 260px;
                    flex: 1 1 260px;
                }
                .btn {
                    border-radius: 10px;
                    border: 1px solid var(--brand);
                    background: var(--brand);
                    color: #fff;
                    padding: 8px 12px;
                    font: inherit;
                    cursor: pointer;
                }
                .btn.secondary {
                    background: #fff;
                    color: var(--brand);
                }
                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    min-width: 760px;
                }
                th, td {
                    padding: 10px 8px;
                    border-bottom: 1px solid #e8eef5;
                    text-align: left;
                    vertical-align: top;
                }
                th {
                    color: #4a6784;
                    font-size: 0.84rem;
                    letter-spacing: 0.03em;
                    text-transform: uppercase;
                }
                .icon-btn {
                    border-radius: 10px;
                    border: 1px solid #bfd0e2;
                    background: #fff;
                    color: #184b71;
                    width: 32px;
                    height: 32px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                .icon-btn.danger {
                    border-color: #efb4ae;
                    color: var(--danger);
                    background: #fff6f5;
                }
                .icon-actions {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                .muted { color: var(--muted); }
                .status {
                    margin: 0;
                    font-weight: 700;
                }
                .status.ok { color: #067647; }
                .status.err { color: #b42318; }
                .modal-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(7, 21, 37, 0.5);
                    display: grid;
                    place-items: center;
                    padding: 16px;
                    z-index: 1000;
                }
                .modal {
                    width: min(560px, 100%);
                    border-radius: 16px;
                    background: #fff;
                    border: 1px solid var(--line);
                    box-shadow: 0 16px 34px rgba(7, 21, 37, 0.35);
                    padding: 16px;
                    display: grid;
                    gap: 10px;
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                }
                .stack { display: grid; gap: 8px; }
            `}</style>

            <section className="hero">
                <h1>Encrypted ID Vault Settings</h1>
                <p>Cleaner controls, faster entry management, and a smoother first-run import path.</p>
            </section>

            <nav className="tabs">
                <button type="button" className={`tab ${activeTab === "entry" ? "active" : ""}`} onClick={() => setActiveTab("entry")}>
                    <Icon path={ICONS.entry} title="Entry" />
                    Entry manager
                </button>
                <button type="button" className={`tab ${activeTab === "lifecycle" ? "active" : ""}`} onClick={() => setActiveTab("lifecycle")}>
                    <Icon path={ICONS.lifecycle} title="Lifecycle" />
                    Vault lifecycle
                </button>
                <button type="button" className={`tab ${activeTab === "preferences" ? "active" : ""}`} onClick={() => setActiveTab("preferences")}>
                    <Icon path={ICONS.preferences} title="Preferences" />
                    Preferences
                </button>
                <button type="button" className={`tab ${activeTab === "backup" ? "active" : ""}`} onClick={() => setActiveTab("backup")}>
                    <Icon path={ICONS.backup} title="Backup" />
                    Backup and restore
                </button>
            </nav>

            {activeTab === "entry" ? (
                <section className="card">
                    <div className="toolbar">
                        <h2 style={{ margin: 0 }}>Entry manager</h2>
                        <button type="button" className="btn" disabled={busy || status.locked} onClick={openCreateModal} title="Create new entry">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Icon path={ICONS.plus} title="Create" />
                                Create New
                            </span>
                        </button>
                    </div>

                    {status.locked ? <p className="muted">Vault is locked. Unlock from Vault lifecycle to manage entries.</p> : null}

                    <div className="control-row">
                        <input
                            className="search"
                            type="text"
                            value={entryFilters.query}
                            onChange={(event) => setEntryFilters((current) => ({ ...current, query: event.target.value }))}
                            placeholder="Search label, category, or notes"
                        />
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <input
                                type="checkbox"
                                checked={entryFilters.favoritesOnly}
                                onChange={(event) => setEntryFilters((current) => ({ ...current, favoritesOnly: event.target.checked }))}
                            />
                            Favorites only
                        </label>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Label</th>
                                    <th>Category</th>
                                    <th>Preview</th>
                                    <th>Favorite</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="muted">No entries found.</td>
                                    </tr>
                                ) : null}
                                {entries.map((entry, index) => {
                                    const isEditing = editingEntryId === entry.id;
                                    return (
                                        <tr key={entry.id}>
                                            <td>
                                                {isEditing ? (
                                                    <input type="text" value={editingEntry.label} onChange={(event) => setEditingEntry((current) => ({ ...current, label: event.target.value }))} />
                                                ) : entry.label}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <input type="text" value={editingEntry.category} onChange={(event) => setEditingEntry((current) => ({ ...current, category: event.target.value }))} />
                                                ) : entry.category}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <div className="stack">
                                                        <input type="text" value={editingEntry.value} onChange={(event) => setEditingEntry((current) => ({ ...current, value: event.target.value }))} placeholder="Value" />
                                                        <input type="text" value={editingEntry.notes} onChange={(event) => setEditingEntry((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                                                    </div>
                                                ) : (
                                                    <div className="stack">
                                                        <span>{entry.maskedPreview}</span>
                                                        {entry.notes ? <span className="muted">{entry.notes}</span> : null}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editingEntry.favorite}
                                                            onChange={(event) => setEditingEntry((current) => ({ ...current, favorite: event.target.checked }))}
                                                        />
                                                        Favorite
                                                    </label>
                                                ) : (entry.favorite ? "Yes" : "No")}
                                            </td>
                                            <td>
                                                <div className="icon-actions">
                                                    {isEditing ? (
                                                        <>
                                                            <button type="button" className="btn" disabled={busy || status.locked} onClick={() => void saveEditEntry()}>Save</button>
                                                            <button type="button" className="btn secondary" disabled={busy} onClick={cancelEditEntry}>Cancel</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button type="button" className="icon-btn" title="Edit" disabled={busy || status.locked} onClick={() => beginEditEntry(entry)}>
                                                                <Icon path={ICONS.edit} title="Edit" />
                                                            </button>
                                                            <button type="button" className="icon-btn" title="Move up" disabled={busy || status.locked || index === 0} onClick={() => void moveEntry(entry.id, index - 1)}>
                                                                <Icon path={ICONS.up} title="Up" />
                                                            </button>
                                                            <button type="button" className="icon-btn" title="Move down" disabled={busy || status.locked || index === entries.length - 1} onClick={() => void moveEntry(entry.id, index + 1)}>
                                                                <Icon path={ICONS.down} title="Down" />
                                                            </button>
                                                            <button type="button" className="icon-btn danger" title="Delete" disabled={busy || status.locked} onClick={() => void deleteEntry(entry.id)}>
                                                                <Icon path={ICONS.delete} title="Delete" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}

            {activeTab === "lifecycle" ? (
                <section className="card">
                    <h2 style={{ margin: 0 }}>Vault lifecycle</h2>
                    <p className="muted">Installed: {status.installedAt ?? "loading..."}</p>
                    <p className="muted">State: {status.locked ? "locked" : "unlocked"}</p>
                    <p className="muted">Last unlocked: {status.lastUnlockedAt ?? "never"}</p>

                    <label className="stack" style={{ maxWidth: 360 }}>
                        Master password
                        <input type="password" value={masterPassword} minLength={8} onChange={(event) => setMasterPassword(event.target.value)} placeholder="Enter master password" />
                    </label>

                    <div className="control-row">
                        <button type="button" className="btn secondary" disabled={busy} onClick={() => void refreshStatus()}>Refresh status</button>
                        {!status.hasVault ? (
                            <button type="button" className="btn" disabled={busy || masterPassword.trim().length < 8} onClick={() => void runAction("vault/create")}>Create vault</button>
                        ) : null}
                        {status.hasVault && status.locked ? (
                            <button type="button" className="btn" disabled={busy || masterPassword.trim().length === 0} onClick={() => void runAction("vault/unlock")}>Unlock vault</button>
                        ) : null}
                        {status.hasVault && !status.locked ? (
                            <button type="button" className="btn" disabled={busy} onClick={() => void runAction("vault/lock")}>Lock vault</button>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {activeTab === "preferences" ? (
                <section className="card">
                    <h2 style={{ margin: 0 }}>Preferences</h2>
                    <label className="stack">
                        Auto-lock minutes
                        <input type="number" min={0} value={preferences.autoLockMinutes} onChange={(event) => updatePreference("autoLockMinutes", Number(event.target.value))} />
                    </label>
                    <label className="stack">
                        Default insert mode
                        <select value={preferences.defaultInsertMode} onChange={(event) => updatePreference("defaultInsertMode", event.target.value as VaultPreferences["defaultInsertMode"])}>
                            <option value="insert">Insert</option>
                            <option value="copy">Copy</option>
                        </select>
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={preferences.clipboardWarningEnabled} onChange={(event) => updatePreference("clipboardWarningEnabled", event.target.checked)} />
                        Clipboard warning enabled
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={preferences.telemetryEnabled} onChange={(event) => updatePreference("telemetryEnabled", event.target.checked)} />
                        Telemetry enabled
                    </label>
                    <div>
                        <button type="button" className="btn" disabled={busy} onClick={() => void savePreferences()}>Save preferences</button>
                    </div>
                </section>
            ) : null}

            {activeTab === "backup" ? (
                <section className="card">
                    <h2 style={{ margin: 0 }}>Backup and restore</h2>
                    <div>
                        <button type="button" className="btn" disabled={busy} onClick={() => void exportVault()}>Export encrypted vault</button>
                    </div>

                    <label className="stack">
                        Import mode
                        <select value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge") }>
                            <option value="merge">Merge with current vault</option>
                            <option value="replace">Replace current vault</option>
                        </select>
                    </label>

                    <label className="stack">
                        Vault file
                        <input
                            ref={importFileInputRef}
                            type="file"
                            accept=".json,.enc.json,application/json"
                            onChange={(event) => void selectImportFile(event)}
                        />
                    </label>
                    {importFileName ? <p className="muted">Selected file: {importFileName}</p> : null}

                    <label className="stack">
                        Master password for imported vault
                        <input type="password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} />
                    </label>

                    <div>
                        <button type="button" className="btn" disabled={busy || !importFile || importPassword.trim().length === 0} onClick={() => void importVault()}>Import encrypted vault</button>
                    </div>
                </section>
            ) : null}

            {showCreateModal ? (
                <div className="modal-backdrop">
                    <section className="modal">
                        <div className="modal-header">
                            <h3 style={{ margin: 0 }}>Create New Entry</h3>
                            <button type="button" className="btn secondary" onClick={closeCreateModal}>Close</button>
                        </div>

                        <label className="stack">
                            Label
                            <input type="text" value={newEntry.label} onChange={(event) => setNewEntry((current) => ({ ...current, label: event.target.value }))} />
                        </label>
                        <label className="stack">
                            Value
                            <input type="text" value={newEntry.value} onChange={(event) => setNewEntry((current) => ({ ...current, value: event.target.value }))} />
                        </label>
                        <label className="stack">
                            Category
                            <input type="text" value={newEntry.category} onChange={(event) => setNewEntry((current) => ({ ...current, category: event.target.value }))} />
                        </label>
                        <label className="stack">
                            Notes
                            <input type="text" value={newEntry.notes} onChange={(event) => setNewEntry((current) => ({ ...current, notes: event.target.value }))} />
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <input type="checkbox" checked={newEntry.favorite} onChange={(event) => setNewEntry((current) => ({ ...current, favorite: event.target.checked }))} />
                            Favorite
                        </label>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button type="button" className="btn secondary" onClick={closeCreateModal}>Cancel</button>
                            <button type="button" className="btn" disabled={busy || status.locked} onClick={() => void createEntry()}>Create New</button>
                        </div>
                    </section>
                </div>
            ) : null}

            {summary ? <p className="status ok">{summary}</p> : null}
            {error ? <p className="status err">{error}</p> : null}
        </main>
    );
}
