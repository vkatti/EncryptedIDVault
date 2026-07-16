# Phase 0 Security Checklist

Date: 2026-07-16
Status: Complete

## Plaintext handling
- Vault crypto round-trip and wrong-password failure paths are covered in package tests.
- Background runtime message handling rejects malformed envelopes before routing.
- Current scaffold stores only non-secret installation metadata in extension storage.

Evidence:
- packages/crypto/test/crypto.test.ts
- apps/extension/src/background/runtimeMessageHandler.ts
- apps/extension/src/background/serviceWorker.ts

## Permissions and manifest boundaries
- Manifest uses least-privilege baseline permissions for current scaffold: storage and contextMenus.
- Host permissions are empty in Phase 0.
- Keyboard commands and context-menu capabilities are declared and contract-tested.

Evidence:
- apps/extension/manifest.ts
- apps/extension/manifest.json
- apps/extension/test/manifest-contract.test.mjs

## Logging controls
- Placeholder logs are event-only and contain no vault values.
- No token, password, or entry-value logging is implemented in scaffold paths.

Evidence:
- apps/extension/src/background/serviceWorker.ts

## Message validation
- Runtime guards enforce source/target boundaries, non-empty id/type, and strict payload shapes.
- Unhandled message types are rejected by router, and invalid envelopes are rejected at boundary.
- Validation and routing behavior are unit-tested.

Evidence:
- packages/security/src/index.ts
- apps/extension/src/background/messageRouter.ts
- apps/extension/src/background/runtimeMessageHandler.ts
- apps/extension/test/message-validation.test.ts
- apps/extension/test/message-router.test.ts
- apps/extension/test/runtime-message-handler.test.ts

## Phase 0 pipeline verification
- Workspace test pipeline passes.
- Workspace build pipeline passes.
- Workspace typecheck pipeline passes.
- Backend scaffold includes health endpoint and webhook placeholder with tests.

Evidence:
- apps/backend/src/server.js
- apps/backend/test/server.test.js
- package.json

## Sign-off summary
Phase 0 repo setup and engineering standards are complete for scaffold scope. Remaining work starts in Phase 1 (secure local vault foundation).
