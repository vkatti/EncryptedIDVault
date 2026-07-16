import React from "react";

type PopupStatus = {
    installedAt: string | null;
    locked: boolean;
    hasVault: boolean;
    lastMessageAt: string | null;
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

export function Popup() {
    const [status, setStatus] = React.useState<PopupStatus>({
        installedAt: null,
        locked: true,
        hasVault: false,
        lastMessageAt: null
    });
    const [error, setError] = React.useState<string | null>(null);

    const refreshStatus = React.useCallback(async () => {
        const response = (await chrome.runtime.sendMessage({
            id: crypto.randomUUID(),
            type: "vault/getStatus",
            source: "popup",
            target: "background",
            payload: {}
        })) as StatusResponse;

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

    return (
        <main>
            <h1>Encrypted ID Vault</h1>
            <p>Installed: {status.installedAt ?? "loading..."}</p>
            <p>Vault: {status.hasVault ? "present" : "not created yet"}</p>
            <p>State: {status.locked ? "locked" : "unlocked"}</p>
            {status.lastMessageAt ? <p>Last message: {status.lastMessageAt}</p> : null}
            {error ? <p role="alert">{error}</p> : null}
            <button type="button" onClick={() => void refreshStatus()}>
                Refresh status
            </button>
        </main>
    );
}
