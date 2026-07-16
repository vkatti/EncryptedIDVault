import type { InsertTargetPayload } from "@encrypted-id-vault/shared";

export type InsertOutcome =
    | {
        ok: true;
        mode: "insert" | "clipboard";
    }
    | {
        ok: false;
        error:
        | "ERR_INSERT_NO_FOCUSED_FIELD"
        | "ERR_INSERT_UNSUPPORTED_ELEMENT"
        | "ERR_INSERT_DOMAIN_NOT_ALLOWED"
        | "ERR_INSERT_CLIPBOARD_UNAVAILABLE";
    };

type ClipboardLike = {
    writeText(text: string): Promise<void>;
};

type EditableElement = HTMLElement & {
    type?: string;
    value?: string;
    selectionStart?: number | null;
    selectionEnd?: number | null;
    setRangeText?: (replacement: string, start?: number, end?: number, selectionMode?: "select" | "start" | "end" | "preserve") => void;
    readOnly?: boolean;
    disabled?: boolean;
    isContentEditable?: boolean;
};

function isAllowedDomain(domainAllowlist: string[] | undefined, hostname: string): boolean {
    if (!domainAllowlist || domainAllowlist.length === 0) {
        return true;
    }

    return domainAllowlist.some((allowedDomain) => {
        const normalized = allowedDomain.trim().toLowerCase();
        if (normalized.length === 0) {
            return false;
        }

        return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
}

function isPasswordInput(element: EditableElement): boolean {
    return element.tagName === "INPUT" && typeof element.type === "string" && element.type.toLowerCase() === "password";
}

function isTextInput(element: EditableElement): boolean {
    if (element.tagName === "TEXTAREA") {
        return true;
    }

    if (element.tagName !== "INPUT") {
        return false;
    }

    const inputType = typeof element.type === "string" ? element.type.toLowerCase() : "text";
    return ["text", "search", "url", "email", "tel", "number", "password", "date", "datetime-local", "month", "time", "week"].includes(inputType);
}

export function canInsertIntoElement(element: EditableElement | null): element is EditableElement {
    if (!element || element.disabled || element.readOnly) {
        return false;
    }

    return !isPasswordInput(element) && (isTextInput(element) || Boolean(element.isContentEditable));
}

function dispatchInputEvents(element: EditableElement): void {
    const eventInit = { bubbles: true, composed: true };
    const EventCtor = globalThis.Event;
    const inputEvent = EventCtor ? new EventCtor("input", eventInit) : ({ type: "input" } as Event);
    const changeEvent = EventCtor ? new EventCtor("change", eventInit) : ({ type: "change" } as Event);
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(changeEvent);
}

export function insertValueIntoElement(element: EditableElement, value: string): boolean {
    if (isPasswordInput(element) || !canInsertIntoElement(element)) {
        return false;
    }

    if (typeof element.value === "string") {
        const currentValue = element.value;
        const start = typeof element.selectionStart === "number" ? element.selectionStart : currentValue.length;
        const end = typeof element.selectionEnd === "number" ? element.selectionEnd : currentValue.length;

        if (typeof element.setRangeText === "function") {
            element.setRangeText(value, start, end, "end");
        } else {
            element.value = `${currentValue.slice(0, start)}${value}${currentValue.slice(end)}`;
        }

        dispatchInputEvents(element);
        return true;
    }

    if (element.isContentEditable) {
        element.textContent = `${element.textContent ?? ""}${value}`;
        dispatchInputEvents(element);
        return true;
    }

    return false;
}

async function copyTextToClipboard(text: string, clipboard: ClipboardLike | undefined): Promise<boolean> {
    if (!clipboard) {
        return false;
    }

    await clipboard.writeText(text);
    return true;
}

export async function insertIntoFocusedField(
    payload: InsertTargetPayload,
    documentRef: Pick<Document, "activeElement" | "location">,
    clipboard: ClipboardLike | undefined = undefined,
    scheduleClear: typeof setTimeout = setTimeout,
    clearClipboard: ClipboardLike | undefined = clipboard
): Promise<InsertOutcome> {
    const activeElement = documentRef.activeElement as EditableElement | null;
    const resolvedClipboard = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
    const resolvedClearClipboard = clearClipboard ?? resolvedClipboard;

    if (!isAllowedDomain(payload.domainAllowlist, documentRef.location.hostname)) {
        return { ok: false, error: "ERR_INSERT_DOMAIN_NOT_ALLOWED" };
    }

    if (!canInsertIntoElement(activeElement)) {
        if (!payload.fallbackToClipboard) {
            return { ok: false, error: "ERR_INSERT_NO_FOCUSED_FIELD" };
        }

        const copied = await copyTextToClipboard(payload.value, resolvedClipboard);
        if (!copied) {
            return { ok: false, error: "ERR_INSERT_CLIPBOARD_UNAVAILABLE" };
        }

        scheduleClear(() => {
            void copyTextToClipboard("", resolvedClearClipboard).catch(() => undefined);
        }, 30000);

        return { ok: true, mode: "clipboard" };
    }

    const inserted = insertValueIntoElement(activeElement, payload.value);
    if (!inserted) {
        if (!payload.fallbackToClipboard) {
            return { ok: false, error: "ERR_INSERT_UNSUPPORTED_ELEMENT" };
        }

        const copied = await copyTextToClipboard(payload.value, resolvedClipboard);
        if (!copied) {
            return { ok: false, error: "ERR_INSERT_CLIPBOARD_UNAVAILABLE" };
        }

        scheduleClear(() => {
            void copyTextToClipboard("", resolvedClearClipboard).catch(() => undefined);
        }, 30000);

        return { ok: true, mode: "clipboard" };
    }

    return { ok: true, mode: "insert" };
}