import React from "react";

import { createMessageEnvelope } from "@encrypted-id-vault/security";
import type { VaultExportFile, VaultPreferences, VaultEntry } from "@encrypted-id-vault/shared";
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

type EntryMutationResponse = {
    ok: boolean;
    entry?: VaultEntry;
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
    const [newEntry, setNewEntry] = React.useState<EntryFormState>(DEFAULT_ENTRY_FORM);
    const [summary, setSummary] = React.useState<string | null>(null);
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

    React.useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

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
        setBusy(false);
    }, [masterPassword, refreshStatus]);

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
        setSummary(`Imported ${response.entryCount ?? 0} entries using ${response.mode ?? importMode} mode`);
        setImportPassword("");
        setImportFile(null);
        setImportFileName(null);
        if (importFileInputRef.current) {
            importFileInputRef.current.value = "";
        }

        await refreshStatus();
        setBusy(false);
    }, [importFile, importMode, importPassword, refreshStatus]);

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
        setSummary("Entry created");
        setNewEntry(DEFAULT_ENTRY_FORM);
        setBusy(false);
    }, [newEntry]);

    return (
        <main style={{
            fontFamily: "Trebuchet MS, Gill Sans, Segoe UI, sans-serif",
            color: "#102a43",
            maxWidth: 900,
            margin: "0 auto",
            padding: "20px",
            display: "grid",
            gap: "14px"
        }}>
            <h1 style={{ margin: 0 }}>Encrypted ID Vault Settings</h1>
            <p style={{ margin: 0, color: "#627d98" }}>Popup is now entries-first. Manage vault settings, backup, and lifecycle here.</p>

            <section style={{ border: "1px solid #d7e2ee", borderRadius: 12, padding: 14, background: "#fff" }}>
                <h2 style={{ marginTop: 0 }}>Vault lifecycle</h2>
                <p style={{ color: "#627d98" }}>Installed: {status.installedAt ?? "loading..."}</p>
                <p style={{ color: "#627d98" }}>State: {status.locked ? "locked" : "unlocked"}</p>
                <p style={{ color: "#627d98" }}>Last unlocked: {status.lastUnlockedAt ?? "never"}</p>

                <label style={{ display: "grid", gap: 6, maxWidth: 320, fontWeight: 600 }}>
                    Master password
                    <input
                        type="password"
                        value={masterPassword}
                        minLength={8}
                        onChange={(event) => setMasterPassword(event.target.value)}
                        placeholder="Enter master password"
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    />
                </label>

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button type="button" disabled={busy} onClick={() => void refreshStatus()}>Refresh status</button>
                    {!status.hasVault ? (
                        <button type="button" disabled={busy || masterPassword.trim().length < 8} onClick={() => void runAction("vault/create")}>Create vault</button>
                    ) : null}
                    {status.hasVault && status.locked ? (
                        <button type="button" disabled={busy || masterPassword.trim().length === 0} onClick={() => void runAction("vault/unlock")}>Unlock vault</button>
                    ) : null}
                    {status.hasVault && !status.locked ? (
                        <button type="button" disabled={busy} onClick={() => void runAction("vault/lock")}>Lock vault</button>
                    ) : null}
                </div>
            </section>

            <section style={{ border: "1px solid #d7e2ee", borderRadius: 12, padding: 14, background: "#fff", display: "grid", gap: 8 }}>
                <h2 style={{ marginTop: 0 }}>Preferences</h2>
                <label style={{ display: "grid", gap: 4 }}>
                    Auto-lock minutes
                    <input
                        type="number"
                        min={0}
                        value={preferences.autoLockMinutes}
                        onChange={(event) => updatePreference("autoLockMinutes", Number(event.target.value))}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                    Default insert mode
                    <select
                        value={preferences.defaultInsertMode}
                        onChange={(event) => updatePreference("defaultInsertMode", event.target.value as VaultPreferences["defaultInsertMode"])}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
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
                    <input
                        type="checkbox"
                        checked={preferences.telemetryEnabled}
                        onChange={(event) => updatePreference("telemetryEnabled", event.target.checked)}
                    />
                    Telemetry enabled
                </label>
                <div>
                    <button type="button" disabled={busy} onClick={() => void savePreferences()}>Save preferences</button>
                </div>
            </section>

            <section style={{ border: "1px solid #d7e2ee", borderRadius: 12, padding: 14, background: "#fff", display: "grid", gap: 8 }}>
                <h2 style={{ marginTop: 0 }}>Backup and restore</h2>
                <div>
                    <button type="button" disabled={busy} onClick={() => void exportVault()}>Export encrypted vault</button>
                </div>

                <label style={{ display: "grid", gap: 4 }}>
                    Import mode
                    <select
                        value={importMode}
                        onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    >
                        <option value="merge">Merge with current vault</option>
                        <option value="replace">Replace current vault</option>
                    </select>
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                    Vault file
                    <input
                        ref={importFileInputRef}
                        type="file"
                        accept=".json,.enc.json,application/json"
                        onChange={(event) => void selectImportFile(event)}
                    />
                </label>
                {importFileName ? <p style={{ margin: 0, color: "#627d98" }}>Selected file: {importFileName}</p> : null}

                <label style={{ display: "grid", gap: 4 }}>
                    Master password for imported vault
                    <input
                        type="password"
                        value={importPassword}
                        onChange={(event) => setImportPassword(event.target.value)}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    />
                </label>

                <div>
                    <button type="button" disabled={busy || !importFile || importPassword.trim().length === 0} onClick={() => void importVault()}>Import encrypted vault</button>
                </div>
            </section>

            <section style={{ border: "1px solid #d7e2ee", borderRadius: 12, padding: 14, background: "#fff", display: "grid", gap: 8 }}>
                <h2 style={{ marginTop: 0 }}>Entry manager</h2>
                <label style={{ display: "grid", gap: 4 }}>
                    Label
                    <input
                        type="text"
                        value={newEntry.label}
                        onChange={(event) => setNewEntry((current) => ({ ...current, label: event.target.value }))}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                    Value
                    <input
                        type="text"
                        value={newEntry.value}
                        onChange={(event) => setNewEntry((current) => ({ ...current, value: event.target.value }))}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                    Category
                    <input
                        type="text"
                        value={newEntry.category}
                        onChange={(event) => setNewEntry((current) => ({ ...current, category: event.target.value }))}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
                    />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                    Notes
                    <input
                        type="text"
                        value={newEntry.notes}
                        onChange={(event) => setNewEntry((current) => ({ ...current, notes: event.target.value }))}
                        style={{ border: "1px solid #b4c6d8", borderRadius: 8, padding: 8 }}
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
                <div>
                    <button type="button" disabled={busy} onClick={() => void createEntry()}>Create entry</button>
                </div>
            </section>

            {summary ? <p style={{ margin: 0, color: "#067647" }}>{summary}</p> : null}
            {error ? <p style={{ margin: 0, color: "#b42318" }}>{error}</p> : null}
        </main>
    );
}
