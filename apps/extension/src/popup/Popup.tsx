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
type PreferenceField = keyof VaultPreferences;

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

async function createEntryMessage(payload: { label: string; value: string; category: string; notes?: string; favorite?: boolean }): Promise<EntryMutationResponse> {
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

async function insertEntryMessage(payload: { entryId: string }): Promise<InsertResponse> {
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
    const [preferences, setPreferences] = React.useState<VaultPreferences>(DEFAULT_PREFERENCES);
    const [entries, setEntries] = React.useState<VaultEntry[]>([]);
    const [entryFilters, setEntryFilters] = React.useState({ query: "", favoritesOnly: false });
    const [newEntry, setNewEntry] = React.useState<EntryFormState>(DEFAULT_ENTRY_FORM);
    const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
    const [editingEntry, setEditingEntry] = React.useState<EntryFormState>(DEFAULT_ENTRY_FORM);
    const [importMode, setImportMode] = React.useState<"replace" | "merge">("merge");
    const [importPassword, setImportPassword] = React.useState("");
    const [importFile, setImportFile] = React.useState<VaultExportFile | null>(null);
    const [importFileName, setImportFileName] = React.useState<string | null>(null);
    const [lastImportSummary, setLastImportSummary] = React.useState<string | null>(null);
    const [lastExportSummary, setLastExportSummary] = React.useState<string | null>(null);
    const importFileInputRef = React.useRef<HTMLInputElement | null>(null);

    const passwordStrength = getPasswordStrength(masterPassword);

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

    React.useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    React.useEffect(() => {
        if (status.preferences) {
            setPreferences(status.preferences);
        }
    }, [status.preferences]);

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
            setBusy(false);
        },
        [masterPassword, refreshStatus]
    );

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
        await refreshStatus();
        setBusy(false);
    }, [preferences, refreshStatus]);

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

    const createEntry = React.useCallback(async () => {
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
            setError(response.error ?? "Unable to create entry");
            setBusy(false);
            return;
        }

        setError(null);
        setNewEntry(DEFAULT_ENTRY_FORM);
        await loadEntries();
        setBusy(false);
    }, [loadEntries, newEntry]);

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
        const response = await insertEntryMessage({ entryId });

        if (!response.ok) {
            setError(response.error ?? "Unable to insert entry");
            setBusy(false);
            return;
        }

        setError(null);
        await refreshStatus();
        setBusy(false);
    }, [refreshStatus]);

    const exportVault = React.useCallback(async () => {
        setBusy(true);
        const response = await exportVaultMessage();

        if (!response.ok || !response.file) {
            setError(getVaultExportErrorMessage(response.error));
            setBusy(false);
            return;
        }

        downloadVaultFile(response.file);
        setLastExportSummary(`Exported encrypted vault at ${response.file.exportedAt}`);
        setLastImportSummary(null);
        setError(null);
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
            setLastImportSummary(null);
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
        const response = await importVaultMessage({
            file: importFile,
            masterPassword: importPassword,
            mode: importMode
        });

        if (!response.ok) {
            setError(getVaultImportErrorMessage(response.error));
            setBusy(false);
            return;
        }

        setError(null);
        setMasterPassword("");
        setImportPassword("");
        setImportFile(null);
        setImportFileName(null);
        setLastExportSummary(null);
        setLastImportSummary(`Imported ${response.entryCount ?? 0} entries using ${response.mode ?? importMode} mode`);
        if (importFileInputRef.current) {
            importFileInputRef.current.value = "";
        }

        await refreshStatus();
        await loadEntries();
        setBusy(false);
    }, [importFile, importMode, importPassword, loadEntries, refreshStatus]);

    return (
        <main>
            <h1>Encrypted ID Vault</h1>
            <p>Installed: {status.installedAt ?? "loading..."}</p>
            <p>Vault: {status.hasVault ? "present" : "not created yet"}</p>
            <p>State: {status.locked ? "locked" : "unlocked"}</p>
            {status.lastMessageAt ? <p>Last message: {status.lastMessageAt}</p> : null}
            {status.lastUserTrigger ? <p>Last trigger: {status.lastUserTrigger}</p> : null}
            {status.lastUnlockedAt ? <p>Last unlocked: {status.lastUnlockedAt}</p> : null}
            {status.preferences ? (
                <section>
                    <h2>Vault preferences</h2>
                    <label>
                        Auto-lock minutes
                        <input
                            type="number"
                            min={0}
                            value={preferences.autoLockMinutes}
                            onChange={(event) => updatePreference("autoLockMinutes", Number(event.target.value))}
                        />
                    </label>
                    <label>
                        Default insert mode
                        <select
                            value={preferences.defaultInsertMode}
                            onChange={(event) => updatePreference("defaultInsertMode", event.target.value as VaultPreferences["defaultInsertMode"])}
                        >
                            <option value="insert">Insert</option>
                            <option value="copy">Copy</option>
                        </select>
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={preferences.clipboardWarningEnabled}
                            onChange={(event) => updatePreference("clipboardWarningEnabled", event.target.checked)}
                        />
                        Clipboard warning enabled
                    </label>
                    <label>
                        Theme
                        <select value={preferences.theme} onChange={(event) => updatePreference("theme", event.target.value as VaultPreferences["theme"])}>
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={preferences.telemetryEnabled}
                            onChange={(event) => updatePreference("telemetryEnabled", event.target.checked)}
                        />
                        Telemetry enabled
                    </label>
                    <button type="button" disabled={busy} onClick={() => void savePreferences()}>
                        Save preferences
                    </button>
                </section>
            ) : null}
            {status.hasVault ? (
                <section>
                    <h2>Backup and restore</h2>
                    <button type="button" disabled={busy} onClick={() => void exportVault()}>
                        Export encrypted vault
                    </button>
                    {lastExportSummary ? <p>{lastExportSummary}</p> : null}

                    <h3>Import encrypted vault</h3>
                    <label>
                        Import mode
                        <select value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
                            <option value="merge">Merge with current vault</option>
                            <option value="replace">Replace current vault</option>
                        </select>
                    </label>
                    {importMode === "replace" ? <p>Replace mode will overwrite your current encrypted vault with the imported file.</p> : null}
                    <label>
                        Vault file
                        <input ref={importFileInputRef} type="file" accept=".json,.enc.json,application/json" onChange={(event) => void selectImportFile(event)} />
                    </label>
                    {importFileName ? <p>Selected file: {importFileName}</p> : null}
                    <label>
                        Master password for imported vault
                        <input
                            type="password"
                            value={importPassword}
                            onChange={(event) => setImportPassword(event.target.value)}
                            placeholder="Enter master password"
                        />
                    </label>
                    <button type="button" disabled={busy || !importFile || importPassword.trim().length === 0} onClick={() => void importVault()}>
                        Import encrypted vault
                    </button>
                    {lastImportSummary ? <p>{lastImportSummary}</p> : null}
                </section>
            ) : null}
            {status.hasVault && !status.locked ? (
                <section>
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
                    <label>
                        <input
                            type="checkbox"
                            checked={entryFilters.favoritesOnly}
                            onChange={(event) => setEntryFilters((current) => ({ ...current, favoritesOnly: event.target.checked }))}
                        />
                        Favorites only
                    </label>
                    <button type="button" disabled={busy} onClick={() => void loadEntries()}>
                        Refresh entries
                    </button>

                    <h3>Create entry</h3>
                    <label>
                        Label
                        <input
                            type="text"
                            value={newEntry.label}
                            onChange={(event) => setNewEntry((current) => ({ ...current, label: event.target.value }))}
                        />
                    </label>
                    <label>
                        Value
                        <input
                            type="text"
                            value={newEntry.value}
                            onChange={(event) => setNewEntry((current) => ({ ...current, value: event.target.value }))}
                        />
                    </label>
                    <label>
                        Category
                        <input
                            type="text"
                            value={newEntry.category}
                            onChange={(event) => setNewEntry((current) => ({ ...current, category: event.target.value }))}
                        />
                    </label>
                    <label>
                        Notes
                        <input
                            type="text"
                            value={newEntry.notes}
                            onChange={(event) => setNewEntry((current) => ({ ...current, notes: event.target.value }))}
                        />
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={newEntry.favorite}
                            onChange={(event) => setNewEntry((current) => ({ ...current, favorite: event.target.checked }))}
                        />
                        Favorite
                    </label>
                    <button type="button" disabled={busy} onClick={() => void createEntry()}>
                        Create entry
                    </button>

                    <h3>Entry list</h3>
                    {entries.length === 0 ? <p>No entries yet.</p> : null}
                    {entries.map((entry, index) => (
                        <article key={entry.id}>
                            <p>
                                <strong>{entry.label}</strong> ({entry.category})
                            </p>
                            <p>Preview: {entry.maskedPreview}</p>
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
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={editingEntry.favorite}
                                            onChange={(event) => setEditingEntry((current) => ({ ...current, favorite: event.target.checked }))}
                                        />
                                        Favorite
                                    </label>
                                    <button type="button" disabled={busy} onClick={() => void saveEditedEntry()}>
                                        Save entry
                                    </button>
                                    <button type="button" disabled={busy} onClick={cancelEditingEntry}>
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <>
                                    {entry.notes ? <p>Notes: {entry.notes}</p> : null}
                                    <p>Favorite: {entry.favorite ? "yes" : "no"}</p>
                                    <button type="button" disabled={busy} onClick={() => startEditingEntry(entry)}>
                                        Edit entry
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => void insertEntry(entry.id)}>
                                        Insert entry
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || index === 0}
                                        onClick={() => void moveEntry(entry.id, index - 1)}
                                    >
                                        Move up
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || index === entries.length - 1}
                                        onClick={() => void moveEntry(entry.id, index + 1)}
                                    >
                                        Move down
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => void deleteEntry(entry.id)}>
                                        Delete entry
                                    </button>
                                </>
                            )}
                        </article>
                    ))}
                </section>
            ) : null}
            {status.hasVault ? null : <p>Create a master password to bootstrap your encrypted local vault.</p>}
            {status.locked ? <p>Unlock is required to access vault entries in this session.</p> : <p>Vault is unlocked in memory only.</p>}

            {status.locked ? (
                <label>
                    Master password
                    <input
                        type="password"
                        value={masterPassword}
                        minLength={8}
                        onChange={(event) => setMasterPassword(event.target.value)}
                        placeholder="At least 8 characters"
                    />
                </label>
            ) : null}

            {status.locked ? <p>Password strength: {passwordStrength}</p> : null}

            {error ? <p role="alert">{error}</p> : null}
            <button type="button" onClick={() => void refreshStatus()}>
                Refresh status
            </button>
            {!status.hasVault ? (
                <button type="button" disabled={busy || masterPassword.trim().length < 8} onClick={() => void runAction("vault/create")}>Create vault</button>
            ) : null}
            {status.hasVault && status.locked ? (
                <button type="button" disabled={busy || masterPassword.trim().length === 0} onClick={() => void runAction("vault/unlock")}>Unlock vault</button>
            ) : null}
            {status.hasVault && !status.locked ? (
                <button type="button" disabled={busy} onClick={() => void runAction("vault/lock")}>Lock vault</button>
            ) : null}
        </main>
    );
}
