import React from "react";

import { createMessageEnvelope } from "@encrypted-id-vault/security";
import type { VaultPreferences } from "@encrypted-id-vault/shared";

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

type Action = "vault/getStatus" | "vault/create" | "vault/unlock" | "vault/lock";
type PreferenceField = keyof VaultPreferences;

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

const DEFAULT_PREFERENCES: VaultPreferences = {
    autoLockMinutes: 5,
    defaultInsertMode: "insert",
    clipboardWarningEnabled: true,
    theme: "system",
    telemetryEnabled: false
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
