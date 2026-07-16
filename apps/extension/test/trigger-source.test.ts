import assert from "node:assert/strict";
import test from "node:test";

import { getCommandTriggerSource, getContextMenuTriggerSource } from "../src/background/triggerSource";

test("getCommandTriggerSource returns namespaced source for allowed commands", () => {
    const source = getCommandTriggerSource("open-vault-popup", ["open-vault-popup", "insert-selected-entry"]);

    assert.equal(source, "command:open-vault-popup");
});

test("getCommandTriggerSource returns null for unknown commands", () => {
    const source = getCommandTriggerSource("unsupported-command", ["open-vault-popup", "insert-selected-entry"]);

    assert.equal(source, null);
});

test("getContextMenuTriggerSource returns source when menu id matches", () => {
    const source = getContextMenuTriggerSource("insert-selected-entry-context", "insert-selected-entry-context");

    assert.equal(source, "context-menu:insert-selected-entry");
});

test("getContextMenuTriggerSource returns null when menu id does not match", () => {
    const source = getContextMenuTriggerSource("another-menu", "insert-selected-entry-context");

    assert.equal(source, null);
});
