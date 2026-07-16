import assert from "node:assert/strict";
import test from "node:test";

import type { InsertTargetPayload } from "@encrypted-id-vault/shared";

import { canInsertIntoElement, insertIntoFocusedField, insertValueIntoElement } from "../src/content/insertion";

function createInputElement(initialValue = "hello") {
    const events: string[] = [];
    const element = {
        tagName: "INPUT",
        type: "text",
        value: initialValue,
        selectionStart: initialValue.length,
        selectionEnd: initialValue.length,
        disabled: false,
        readOnly: false,
        isContentEditable: false,
        textContent: null,
        dispatchEvent(event: { type: string }) {
            events.push(event.type);
            return true;
        },
        setRangeText(replacement: string, start?: number, end?: number) {
            const resolvedStart = start ?? 0;
            const resolvedEnd = end ?? initialValue.length;
            this.value = `${this.value.slice(0, resolvedStart)}${replacement}${this.value.slice(resolvedEnd)}`;
        }
    };

    return { element: element as any, events };
}

test("canInsertIntoElement rejects password inputs", () => {
    const element = {
        tagName: "INPUT",
        type: "password",
        disabled: false,
        readOnly: false,
        isContentEditable: false
    };

    assert.equal(canInsertIntoElement(element as any), false);
});

test("insertValueIntoElement writes into an input and emits events", () => {
    const { element, events } = createInputElement("hello");

    const inserted = insertValueIntoElement(element, " world");

    assert.equal(inserted, true);
    assert.equal(element.value, "hello world");
    assert.deepEqual(events, ["input", "change"]);
});

test("insertIntoFocusedField inserts into the active element", async () => {
    const { element } = createInputElement("user");
    const payload: InsertTargetPayload = {
        entryId: "entry-1",
        value: "@example.com"
    };

    const result = await insertIntoFocusedField(
        payload,
        {
            activeElement: element,
            location: { hostname: "example.com" } as Location
        } as Pick<Document, "activeElement" | "location">
    );

    assert.deepEqual(result, { ok: true, mode: "insert" });
    assert.equal(element.value, "user@example.com");
});

test("insertIntoFocusedField falls back to clipboard when requested", async () => {
    const clipboardWrites: string[] = [];
    const scheduledDelays: number[] = [];
    const payload: InsertTargetPayload = {
        entryId: "entry-2",
        value: "secret-value",
        fallbackToClipboard: true
    };

    const result = await insertIntoFocusedField(
        payload,
        {
            activeElement: null,
            location: { hostname: "example.com" } as Location
        } as Pick<Document, "activeElement" | "location">,
        {
            writeText: async (value: string) => {
                clipboardWrites.push(value);
            }
        },
        ((callback: () => void, delay: number) => {
            scheduledDelays.push(delay);
            callback();
            return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout,
        {
            writeText: async (value: string) => {
                clipboardWrites.push(value);
            }
        }
    );

    assert.deepEqual(result, { ok: true, mode: "clipboard" });
    assert.deepEqual(clipboardWrites, ["secret-value", ""]);
    assert.deepEqual(scheduledDelays, [30000]);
});

test("insertIntoFocusedField rejects a blocked domain", async () => {
    const payload: InsertTargetPayload = {
        entryId: "entry-3",
        value: "secret-value",
        domainAllowlist: ["allowed.test"]
    };

    const result = await insertIntoFocusedField(
        payload,
        {
            activeElement: null,
            location: { hostname: "blocked.test" } as Location
        } as Pick<Document, "activeElement" | "location">
    );

    assert.deepEqual(result, { ok: false, error: "ERR_INSERT_DOMAIN_NOT_ALLOWED" });
});