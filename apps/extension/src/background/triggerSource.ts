export function getCommandTriggerSource(command: string, allowedCommands: readonly string[]): string | null {
    if (allowedCommands.includes(command)) {
        return `command:${command}`;
    }

    return null;
}

export function getContextMenuTriggerSource(menuItemId: unknown, expectedMenuItemId: string): string | null {
    if (menuItemId === expectedMenuItemId) {
        return "context-menu:insert-selected-entry";
    }

    return null;
}
