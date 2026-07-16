import React from "react";

import { createMessageEnvelope } from "@encrypted-id-vault/security";

type PopupStatus = {
    installedAt: string | null;
    locked: boolean;
    hasVault: boolean;
    lastMessageAt: string | null;
    lastUserTrigger: string | null;
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

type Action = "vault/getStatus" | "vault/create" | "vault/unlock" | "vault/lock";

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

export function Popup() {
    const [status, setStatus] = React.useState<PopupStatus>({
        installedAt: null,
        locked: true,
        hasVault: false,
        lastMessageAt: null,
        lastUserTrigger: null
    });
    const [error, setError] = React.useState<string | null>(null);
    const [masterPassword, setMasterPassword] = React.useState("");
    const [busy, setBusy] = React.useState(false);

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
            setBusy(false);
        },
        [masterPassword, refreshStatus]
    );

    return (
        <main>
            <h1>Encrypted ID Vault</h1>
            <p>Installed: {status.installedAt ?? "loading..."}</p>
            <p>Vault: {status.hasVault ? "present" : "not created yet"}</p>
            <p>State: {status.locked ? "locked" : "unlocked"}</p>
            {status.lastMessageAt ? <p>Last message: {status.lastMessageAt}</p> : null}
            {status.lastUserTrigger ? <p>Last trigger: {status.lastUserTrigger}</p> : null}
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
