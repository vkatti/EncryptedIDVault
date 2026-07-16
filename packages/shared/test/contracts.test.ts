import assert from "node:assert/strict";
import test from "node:test";

import { ERROR_CODES, VAULT_SCHEMA_VERSION } from "../src/index.js";

test("shared contracts expose the expected error codes", () => {
  assert.ok(ERROR_CODES.includes("ERR_UNLOCK_INVALID_PASSWORD"));
  assert.ok(ERROR_CODES.includes("ERR_SYNC_CONFLICT"));
});

test("vault schema version is pinned for v1", () => {
  assert.equal(VAULT_SCHEMA_VERSION, 1);
});
