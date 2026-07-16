export const manifest = {
    manifest_version: 3,
    name: "Encrypted ID Vault",
    version: "0.1.0",
    action: {
        default_title: "Encrypted ID Vault"
    },
    background: {
        service_worker: "src/background/serviceWorker.ts",
        type: "module"
    },
    permissions: ["storage", "contextMenus"],
    commands: {
        "open-vault-popup": {
            suggested_key: {
                default: "Ctrl+Shift+Y"
            },
            description: "Open Encrypted ID Vault popup"
        },
        "insert-selected-entry": {
            suggested_key: {
                default: "Ctrl+Shift+I"
            },
            description: "Insert selected entry into focused field"
        }
    },
    host_permissions: [],
    minimum_chrome_version: "120"
} as const;
