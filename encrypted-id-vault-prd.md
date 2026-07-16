# Product Requirements Document: Encrypted ID Vault Browser Extension

## Document purpose
This PRD defines the product, security model, architecture, feature scope, user flows, technical requirements, and acceptance criteria for a browser extension that lets users securely store and insert sensitive identifiers such as PAN, Aadhaar, PRAN, EPF/UAN, passport numbers, GSTIN, bank account numbers, and similar values. The product is intended for Chrome first and should remain compatible with Microsoft Edge and other Chromium-based desktop browsers with minimal code changes because Chromium-based browsers largely share the same extension APIs and packaging model.[cite:20][cite:27]

## Product summary
The product is a Chromium browser extension that stores user-defined key-value pairs in an encrypted vault and lets the user insert a selected value into the currently focused form field from a popup, shortcut, or context action. Sensitive data must be encrypted at rest, decrypted only in memory during an unlocked session, and uploaded only as encrypted vault files when the user enables cloud backup/sync.[cite:80][cite:81][cite:83]

The free plan includes a local-only encrypted vault. The paid Pro plan includes encrypted vault export/import and cloud-backed sync across devices using user-selected storage providers such as Google Drive and Dropbox. A lifetime plan may exist as a pricing option, but it does not change product capabilities relative to Pro. Google Drive access should prefer the narrow `drive.file` scope because it limits access to files the app creates or that the user explicitly opens with the app, and Dropbox integration should use OAuth flows designed for public clients with PKCE rather than embedding a reusable client secret in the extension.[cite:35][cite:86][cite:89][cite:43][cite:87][cite:88]

## Product goals
- Replace insecure plaintext notes for sensitive identifiers with a safer local encrypted vault.[cite:80][cite:83]
- Make repetitive insertion of identifiers into web forms fast and low-friction.
- Support multi-device portability through encrypted vault file export/import and paid cloud sync.
- Minimize trust requirements by ensuring cloud providers and the extension backend never receive plaintext vault data.[cite:80][cite:85]
- Keep permissions narrow and user-comprehensible to improve adoption and store approval chances.[cite:82][cite:83][cite:35]

## Non-goals
- Enterprise administration, shared team vaults, role-based access control, or organizational billing are out of scope for v1.
- Full password manager functionality, website credential autofill, TOTP, passkeys, or payment card storage are out of scope for v1.
- Mobile browser support is out of scope for v1 because Chromium desktop extension compatibility is the priority and mobile support is inconsistent.
- Automatic unrestricted form scraping across every page is out of scope; insertion should be user-initiated and targeted.

## User problem
Users often maintain PAN, Aadhaar, PRAN, EPF/UAN, GSTIN, passport, account numbers, and other recurring identifiers in insecure notes, messaging apps, or documents because they need to repeatedly copy and paste them into websites. This workflow is inconvenient, error-prone, and exposes sensitive data in plaintext. The extension solves this by combining secure encrypted storage with controlled field insertion in the browser.[cite:80][cite:83]

## Target users
### Primary user
An individual professional or power user who repeatedly enters personal, business, tax, employment, and banking identifiers into browser forms and wants a faster workflow than opening a notes app.

### Secondary user
A privacy-conscious user who wants the convenience of a lightweight vault without moving to a full password manager for non-password structured identifiers.

## Value proposition
- Faster than switching to a notes app.
- Safer than storing identifiers in plaintext notes.
- Simpler than a full password manager for non-login values.
- Portable across browsers/devices through encrypted vault file sync.
- Trust-minimized because plaintext is not uploaded to cloud storage providers.[cite:80][cite:85]

## Core product principles
1. Encrypt by default.
2. Local-first by default.
3. User-initiated insertion only.
4. Minimal permissions.
5. Paid convenience, not paid safety.
6. Cross-browser portability through standard Chromium APIs.

## Plans and packaging
| Plan | Storage | Devices | Cloud sync | Export/import | Entry limit | Notes |
|---|---|---:|---|---|---:|---|
| Free | Local encrypted vault | Single browser profile by default | No | Manual local encrypted export/import allowed only if product strategy permits; otherwise Pro-only | Configurable, suggested 10-25 | Core evaluation tier |
| Pro Monthly / Yearly | Local encrypted vault + provider-backed encrypted vault file | Multiple devices | Yes | Yes | Unlimited | Includes Drive/Dropbox sync |
| Lifetime | Same as Pro | Multiple devices | Yes | Yes | Unlimited | Pricing-only variant of Pro |

### Packaging decision
The recommended packaging is Free, Pro Monthly, Pro Yearly, and Lifetime only. No Enterprise plan is included.

## Supported browsers
### v1 supported
- Google Chrome desktop
- Microsoft Edge desktop
- Brave desktop
- Opera desktop

### v1 unsupported
- Chrome Android
- Edge Android
- Safari
- Firefox, unless explicitly planned later

### Compatibility requirement
Use standard Manifest V3 APIs and avoid browser-specific features unless guarded behind capability checks because Microsoft states that porting Chrome extensions to Edge usually requires minimal changes and Chromium-based browsers largely share the same extension model.[cite:20][cite:21][cite:27]

## Personas and jobs to be done
### Persona 1: Frequent form filler
- Keeps tax and identity numbers in notes.
- Wants one shortcut to insert the right item into the current field.
- Cares about speed more than advanced taxonomy.

### Persona 2: Privacy-conscious user
- Distrusts storing sensitive identifiers in plaintext notes.
- Wants local encryption and clear control over when values are revealed or inserted.
- Wants cloud backup only if the file is encrypted before upload.

### Persona 3: Multi-device user
- Uses work laptop and personal laptop.
- Wants the same vault on both devices.
- Is willing to pay for seamless encrypted portability.

## Success metrics
### Product metrics
- Activation rate: percentage of installs that create a vault.
- Time to first successful insertion.
- Weekly active users.
- Percentage of users with at least 3 stored entries.
- Free-to-Pro conversion rate.
- Annual plan share among Pro subscribers.
- Lifetime plan share.

### Reliability metrics
- Vault unlock failure rate.
- Failed insertion rate.
- Sync conflict rate.
- Cloud sync success rate.
- Mean time to recover from sync conflict.

### Security metrics
- Number of incidents involving plaintext persistence in logs or storage.
- Number of detected unauthorized message origin attempts.
- Number of CSP violations.
- Number of high-severity dependency vulnerabilities open longer than SLA.

## Functional requirements

## FR1: Vault creation and unlock
The extension must let a first-time user create a vault protected by a master password. The master password must never be stored directly. It must be used to derive an encryption key using a memory-hard or otherwise strong KDF supported by the chosen implementation approach, and encrypted data must be written to persistent storage only in ciphertext form.[cite:80][cite:81][cite:85]

### Requirements
- Prompt user to create master password on first launch.
- Show password strength guidance.
- Generate salt and key derivation parameters.
- Derive key client-side.
- Store encrypted vault blob plus non-sensitive metadata.
- Unlock vault by deriving key again from entered password.
- Keep decrypted material only for current unlocked session.
- Allow user-configurable auto-lock timer.

### Acceptance criteria
- No plaintext vault values exist in persistent storage after vault creation.[cite:80][cite:81]
- Closing the browser or explicit lock removes decrypted state from session memory.
- Wrong password cannot decrypt vault and does not corrupt stored ciphertext.

## FR2: Entry management
The user must be able to create, edit, delete, reorder, search, and categorize vault entries.

### Entry data model
Each entry should support:
- `id`
- `label` such as PAN, Aadhaar, PRAN, GSTIN, Passport
- `value`
- `category`
- `notes` optional
- `maskedPreview`
- `favorite`
- `createdAt`
- `updatedAt`
- `lastUsedAt`
- `domainAllowlist` optional
- `copyModeAllowed` boolean
- `insertModeAllowed` boolean

### Requirements
- Values are masked by default.
- Reveal requires explicit user action.
- Search must work on labels and optionally encrypted-search-compatible metadata if implemented.
- Duplicate labels allowed with user warning.
- Built-in templates for common Indian identifiers are optional but recommended.

### Acceptance criteria
- User can create, edit, and delete entries without exposing raw values in persistent plaintext.
- Masked preview is visible without full reveal.
- Entry list remains usable with at least 500 entries.

## FR3: Controlled insertion into focused field
The extension must insert a selected value into the currently focused editable field on the active tab only after explicit user action.

### Supported surfaces
- Popup UI
- Keyboard shortcut / command palette
- Context menu action on editable fields

### Insertion behavior
- Detect currently focused editable element in page context.
- Support standard inputs, textareas, and common contenteditable cases where feasible.
- Prefer direct insertion over clipboard when possible.
- Trigger appropriate input/change events after insertion.
- Never insert into password fields.
- Respect per-entry domain allowlist.

### Acceptance criteria
- User can focus a text field, choose an entry, and insert it successfully on major websites using standard form fields.
- If insertion is blocked or unsupported, user receives a safe fallback path such as temporary copy with auto-clear.
- No background autofill occurs without explicit user action.

## FR4: Clipboard fallback
The extension may offer copy-to-clipboard as a fallback when direct insertion is not possible.

### Requirements
- Clipboard use must be opt-in per action.
- Show warning that clipboard can be read by other applications/pages.
- Optional auto-clear timer for clipboard where platform limitations permit.
- Copy events should be locally logged in non-sensitive audit metadata.

### Acceptance criteria
- Copy action is never the default when direct insertion is available.
- Auto-clear timer can be enabled/disabled by the user.

## FR5: Locking and session memory
The extension must support secure locking behavior.

### Requirements
- Manual lock button always visible when unlocked.
- Auto-lock on browser restart.
- Auto-lock after inactivity timer.
- Optional re-prompt before reveal or copy for highly sensitive entries.
- Session secrets should prefer memory-only storage mechanisms where possible; MV3 session storage is suitable for in-memory state instead of persisting to disk.[cite:81]

### Acceptance criteria
- Decrypted session state is removed after lock.
- Unlock state does not survive browser restart unless explicitly designed and documented with equivalent security.

## FR6: Local encrypted export/import
The extension must support exporting the vault as an encrypted file and importing it on another device or browser profile.

### Requirements
- Export format: `vault.enc.json` or similar.
- Exported file contains encrypted payload and safe metadata such as schema version, KDF params, timestamps, provider sync metadata, and optional integrity fields.
- Import validates schema version and integrity before replacing or merging local vault.
- User can choose replace or merge behavior.

### Acceptance criteria
- Exported file never contains plaintext values.
- Imported file from another device unlocks successfully with correct password.
- Invalid or tampered file is rejected with clear error.

## FR7: Paid cloud sync
Cloud sync is a Pro-only feature. The extension must upload and download only encrypted vault files.

### Supported providers in v1
- Google Drive
- Dropbox

### Optional later
- Box

### Requirements
- User authenticates with provider using provider-approved OAuth flow.
- Extension uploads encrypted vault file to provider-selected location or app-specific folder.
- Sync supports download latest, upload latest, compare timestamps/version, and manual conflict resolution.
- User can disconnect provider and revoke access.
- Plaintext vault data must never be sent to provider.

### Acceptance criteria
- Same encrypted vault file can be used across at least two devices with successful unlock using master password.
- Provider only stores ciphertext payload and metadata chosen by product.
- Conflicting updates are detected and surfaced before silent overwrite.

## FR8: Google Drive integration
Google Drive integration should use the narrowest viable scope, preferably `drive.file`, because Google documents this scope as a way to limit access to files the app creates or that the user explicitly chooses to share with the app.[cite:35][cite:89][cite:86]

### Requirements
- Use OAuth with Chrome/Chromium-compatible identity flow.
- Request only `drive.file` unless a broader scope is proven necessary.[cite:35][cite:89]
- Support create, update, list app-created/opened vault file, and download latest version.
- Store provider tokens securely and minimally.
- Offer clear disconnect and token revocation UX.

### Acceptance criteria
- User can connect Drive, create a vault file, and sync without granting broad Drive access when `drive.file` is sufficient.[cite:35][cite:89]
- App can only access files created by or explicitly opened with the app under this scope model.[cite:86]

## FR9: Dropbox integration
Dropbox integration should use an OAuth flow suitable for public clients, preferably Authorization Code with PKCE, because PKCE is designed to secure public-client exchanges without relying on an embedded client secret.[cite:87][cite:43]

### Requirements
- Use provider-recommended OAuth with PKCE.
- Prefer App Folder-style limited access if compatible with product UX.
- Support create/update/download encrypted vault file.
- Provide reconnect flow when token expires.

### Acceptance criteria
- User can connect Dropbox and sync encrypted vault without embedding a reusable secret in extension code.[cite:87][cite:88]
- Refresh or re-auth flow does not expose plaintext vault content.

## FR10: Premium entitlement
The extension must enforce paid access for cloud sync features while keeping local vault security available to free users.

### Requirements
- Free users can create and use local encrypted vault.
- Pro users unlock provider connections and multi-device sync.
- Lifetime users receive same feature set as Pro.
- Entitlement checks should fail closed for premium sync actions but should never lock users out of their local vault data.
- Local vault access must remain available even if billing service is temporarily unreachable.

### Acceptance criteria
- Expired Pro blocks new sync actions but preserves access to already synced local encrypted data.
- User can downgrade without data loss.

## FR11: Payments and subscriptions
The product must support Free, Pro Monthly, Pro Yearly, and Lifetime plans. Third-party billing flows such as Stripe-backed implementations are a practical approach for browser extensions because legacy store-native payment options are not the primary strategic path for current extension monetization discussions.[cite:50][cite:52][cite:55]

### Requirements
- Hosted checkout outside extension UI or in compliant external purchase flow.
- Extension receives signed entitlement status via backend/API.
- Support subscription renewal, cancellation, failed payment, and lifetime purchase states.
- Listing and in-product UI must clearly disclose which features are paid because store policies require purchase clarity.[cite:59]

### Acceptance criteria
- Upgrade flow is clear and does not surprise users.
- Purchase state syncs to extension without exposing payment credentials.
- Loss of billing connectivity degrades gracefully.

## FR12: Audit and transparency
The extension should provide local, non-sensitive activity history to increase user trust.

### Requirements
- Log events like vault created, unlock success/failure count, entry inserted, entry copied, file exported, provider connected, sync success/failure.
- Never log plaintext values.
- Let user clear local activity history.

### Acceptance criteria
- Audit timeline never contains secret values.
- User can inspect last sync time and last used entry label without revealing the secret itself.

## FR13: Settings and preferences
The extension must support:
- Auto-lock timer
- Default insertion mode
- Clipboard warning toggle
- Domain allowlist defaults
- Theme
- Telemetry opt-in/out
- Export/import preferences
- Sync provider management

## Security requirements

## SR1: Encryption at rest
Sensitive vault data must be encrypted before writing to any persistent storage, including `chrome.storage.local`, IndexedDB, local files, or synced provider files. Chromium extension guidance and community best practice indicate that sensitive vault data should be encrypted when written to disk.[cite:80][cite:81]

## SR2: Session-only decrypted state
Decrypted state should be kept in memory only for the unlocked session, using memory-oriented storage where feasible such as `chrome.storage.session` for non-persistent runtime data.[cite:81]

## SR3: Key handling
- Never hardcode encryption keys in extension source.
- Never derive encryption solely from machine/browser identity.
- Never store master password directly.
- Use per-vault salt and versioned KDF parameters.

## SR4: Minimal permissions
Request least privilege in the manifest and use optional permissions where possible because Chrome extension security guidance emphasizes least privilege and narrow permissions.[cite:82][cite:83]

### Expected baseline permissions
- `storage`
- `activeTab`
- `scripting`
- `contextMenus` optional
- `clipboardWrite` if copy fallback is offered
- `identity` or equivalent auth-related capability if needed for provider OAuth
- Provider-specific host permissions, ideally optional and narrow

## SR5: Strict CSP and safe code patterns
Manifest V3 restrictions and extension security best practices require avoiding inline/eval-like behavior, validating messages, and using HTTPS for network calls.[cite:82][cite:83]

### Requirements
- No `eval`.
- No remote code execution.
- Strict CSP.
- Validate all messages between popup, service worker, options page, and content script.
- Sanitize any user-entered notes/labels before rendering.

## SR6: Token security
- Treat provider access tokens as sensitive.
- Encrypt or otherwise minimize persistent token exposure where possible.
- Revoke/delete tokens on disconnect.
- Do not embed provider client secrets in extension code.[cite:87][cite:88]

## SR7: Network security
- All backend and provider communication over HTTPS.
- No plaintext secret values in logs, analytics payloads, or error reports.
- Telemetry must be opt-in and redacted.

## SR8: Data minimization
Store only information necessary for product function. The extension should not collect browsing history, full page contents, or background page data unrelated to explicit insert actions.[cite:82][cite:83]

## UX requirements

## UX1: Onboarding
1. Install extension.
2. Welcome screen explains local-first encrypted vault concept.
3. User creates master password.
4. User creates first entry or imports encrypted file.
5. User sees how to insert into a focused field.
6. Optional upgrade prompt explains paid cloud sync.

## UX2: Popup layout
### Sections
- Locked screen
- Unlock screen
- Entry search list
- Quick actions: insert, reveal, copy, favorite
- Sync status pill for Pro users
- Upgrade CTA for Free users
- Settings shortcut

### Design constraints
- Popup must support keyboard navigation.
- Entry list should be responsive and fast.
- Secrets masked by default.

## UX3: Options page
### Sections
- Vault settings
- Entry manager full screen
- Export/import
- Provider connections
- Billing/account
- Security preferences
- Activity history

## UX4: Command palette / shortcut
A global extension shortcut should open a searchable insert panel for the active tab. This is the fastest workflow for frequent users.

## UX5: Failure handling
- Wrong master password: clear error, no data loss.
- Field unsupported: explain fallback.
- Sync conflict: guided compare-and-choose flow.
- Provider token expired: reconnect prompt.
- Offline state: queue manual retry but do not claim success.

## Detailed user stories
### Local vault
- As a new user, the user can create an encrypted vault with a master password.
- As a user, the user can add a PAN entry and later insert it into a government or banking portal form.
- As a user, the user can lock the vault immediately after use.
- As a user, the user can export the encrypted vault file before reinstalling the browser.

### Pro sync
- As a Pro user, the user can connect Google Drive and sync an encrypted vault file.
- As a Pro user, the user can install the extension on another laptop, connect Drive, download the encrypted vault file, unlock it, and continue using it.
- As a Pro user, the user can disconnect Dropbox and revoke access without deleting the local vault.

### Billing
- As a free user, the user can see that cloud sync is a Pro feature before starting the flow.
- As a lifetime user, the user retains Pro features without recurring billing.

## Information architecture
### Main navigation
- Popup
  - Search
  - Favorites
  - Recent
  - Lock/Unlock
  - Upgrade/Sync status
- Options page
  - Vault
  - Entries
  - Sync
  - Billing
  - Security
  - Activity
  - About

## Technical architecture
### Extension components
- Manifest V3 configuration
- Background service worker
- Popup UI
- Options page
- Content script for insertion
- Shared crypto module
- Shared vault repository/storage module
- Provider adapters: Drive, Dropbox
- Billing/entitlement client

### Recommended internal modules
- `crypto/deriveKey`
- `crypto/encryptVault`
- `crypto/decryptVault`
- `vault/loadVault`
- `vault/saveVault`
- `vault/exportVault`
- `vault/importVault`
- `insert/fieldDetector`
- `insert/insertValue`
- `sync/driveAdapter`
- `sync/dropboxAdapter`
- `billing/getEntitlement`
- `security/messageGuards`

### Storage model
#### Persistent local storage
- Encrypted vault blob
- Non-sensitive vault metadata
- Non-sensitive preferences
- Minimal provider token metadata
- Non-sensitive activity log

#### Session storage / memory
- Derived session key or wrapped key handle
- Unlocked vault plaintext object in memory only
- Recently used item IDs

## Suggested vault schema
```json
{
  "schemaVersion": 1,
  "vaultId": "uuid",
  "kdf": {
    "name": "argon2id-or-pbkdf2",
    "salt": "base64",
    "params": {
      "iterations": 210000,
      "memory": 65536,
      "parallelism": 1
    }
  },
  "encryption": {
    "algorithm": "AES-GCM",
    "nonce": "base64"
  },
  "ciphertext": "base64",
  "integrity": {
    "method": "aes-gcm-tag-or-hmac",
    "value": "base64"
  },
  "meta": {
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "lastSyncedAt": "ISO-8601",
    "syncProvider": "drive|dropbox|null"
  }
}
```

## Sync model
### v1 sync strategy
Use single encrypted file sync with manual conflict resolution. This is simpler and safer than record-level syncing.

### Conflict policy
- Each vault file carries `updatedAt`, `deviceId`, and revision metadata.
- If both local and remote changed since last common revision, show conflict dialog.
- User chooses replace local, replace remote, or duplicate to review.

### Why single-file sync
It reduces complexity, avoids plaintext index leakage, and matches the product’s trust model because cloud providers handle only one encrypted artifact.[cite:35][cite:43]

## Provider integration details
### Google Drive
- Preferred scope: `drive.file`.[cite:35][cite:89]
- Create or update encrypted file in app-chosen location or user-selected location.
- Maintain remote file ID in local metadata.
- Show provider disconnect option.

### Dropbox
- Use OAuth with PKCE for public-client safety.[cite:87][cite:43]
- Prefer limited app access if feasible.
- Maintain remote file path/ID in metadata.

### Box
- Defer to later phase unless specifically required.

## Billing architecture
### Recommended model
- Hosted checkout using Stripe or Stripe-backed monetization service.
- Backend stores user account, customer ID, plan, entitlement state, renewal state.
- Extension authenticates user to backend through magic link or account sign-in and fetches signed entitlement.

### Entitlement rules
- Free: local features only.
- Pro active: cloud sync enabled.
- Pro grace period: read-only sync state, no destructive remote writes unless policy allows.
- Lifetime: same features as Pro, never expires.

## Privacy requirements
- Publish a clear privacy policy.
- State that secret values are encrypted before leaving device.
- State what telemetry is collected, if any.
- State that browsing data is not harvested for advertising.
- Explain provider scopes in plain language.

## Accessibility requirements
- Keyboard-first popup and options page.
- Visible focus states.
- ARIA labels on icon buttons.
- Color contrast compliant with WCAG AA.
- Screen reader labels for masked/revealed states.

## Performance requirements
- Popup first interactive render under 500 ms on warm start on modern desktop hardware.
- Search results under 100 ms for common vault sizes.
- Insert action under 200 ms after user selection on typical pages.
- Unlock operation should feel responsive; heavy KDF work may show progress indicator.

## Analytics requirements
Analytics are optional and opt-in. If enabled, collect only redacted product metrics such as plan conversion, vault created, first entry created, first insertion success, provider connected, and sync success/failure. Never send secret values, labels if considered sensitive, or destination page contents.

## Error taxonomy
- `ERR_UNLOCK_INVALID_PASSWORD`
- `ERR_VAULT_CORRUPT`
- `ERR_IMPORT_SCHEMA_UNSUPPORTED`
- `ERR_INSERT_NO_FOCUSED_FIELD`
- `ERR_INSERT_UNSUPPORTED_ELEMENT`
- `ERR_PROVIDER_AUTH_FAILED`
- `ERR_PROVIDER_SCOPE_DENIED`
- `ERR_SYNC_CONFLICT`
- `ERR_BILLING_ENTITLEMENT_UNKNOWN`
- `ERR_NETWORK_OFFLINE`

## Notifications and messaging
- Use concise in-product notifications only.
- Avoid secret values in messages.
- Upgrade prompts should appear only in sync-related flows, not during core secure local use.

## Release scope
### MVP
- Chrome desktop support
- Manifest V3
- Local encrypted vault
- Entry CRUD
- Popup search and direct insertion
- Lock/unlock + auto-lock
- Encrypted file export/import
- Pro gating framework
- Google Drive sync
- Basic billing + entitlement

### Post-MVP
- Edge Add-ons listing
- Dropbox sync
- Conflict history/version snapshots
- More templates/categories
- Safer clipboard auto-clear improvements
- Box sync if demand exists

## Milestones
### Milestone 1: Foundations
- Manifest V3 shell
- Crypto module
- Vault persistence
- Lock/unlock screens

### Milestone 2: Core utility
- Entry CRUD
- Popup search
- Content-script insertion
- Command shortcut

### Milestone 3: Portability
- Encrypted export/import
- Activity history
- Settings

### Milestone 4: Paid sync
- Account + billing
- Entitlement enforcement
- Drive sync
- Conflict handling

### Milestone 5: Cross-browser polish
- Edge compatibility review
- Brave/Opera smoke tests
- Store assets and compliance

## QA test plan
### Security QA
- Verify no plaintext in persistent local storage.
- Verify no plaintext in exported file.
- Verify no plaintext in provider uploads.
- Verify lock clears decrypted session state.
- Verify message origin validation between extension components.

### Functional QA
- Create/edit/delete entries.
- Insert into common forms.
- Reveal/copy behavior.
- Import/export round trip.
- Drive connect/upload/download.
- Subscription upgrade/downgrade.

### Cross-browser QA
- Chrome latest stable.
- Edge latest stable.
- Brave latest stable.
- Opera latest stable.

### Usability QA
- New user completes onboarding in under 3 minutes.
- User can insert first entry without reading docs.
- Upgrade boundary is understandable.

## Store readiness checklist
- Permissions justified in listing.
- Paid features clearly disclosed.[cite:59]
- Privacy policy published.
- No misleading security claims such as “never exposed” without clarifying that insertion/reveal happens only on user action.
- Screenshots demonstrate local-first encrypted model.

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Extension stores plaintext accidentally in logs or storage | Critical | Security tests, storage inspection in CI, redaction utilities, explicit code review gates |
| Sync conflicts overwrite user data | High | Single-file revision metadata, manual conflict resolution, backup before overwrite |
| OAuth/provider review friction | Medium | Use narrow scopes, clear consent copy, start with Drive then Dropbox.[cite:35][cite:89][cite:43] |
| Users forget master password | High | Clear recovery warning; no fake recovery promise if zero-knowledge model is used |
| Excessive permissions hurt adoption | High | Least privilege, optional permissions, transparent disclosure.[cite:82][cite:83] |
| Lifetime plan hurts recurring revenue | Medium | Price lifetime high enough and keep annual plan highlighted |

## Open product decisions
- Exact entry limit for free tier.
- Whether manual encrypted export/import is free or Pro-only.
- Whether labels themselves are encrypted or partially plaintext for easier search.
- KDF implementation choice: native-only PBKDF2 vs Argon2 WebAssembly.
- Whether account creation is mandatory for Pro or optional until sync is enabled.
- Whether sync supports one provider connection only in v1 or multiple.
- Whether temporary clipboard copy is available in Free or Pro.

## Engineering decisions recommended
- Build on Manifest V3 from day one because Chrome best practices center on MV3 compliance and security posture.[cite:82]
- Prefer Web Crypto primitives where available for core encryption tasks, with careful review of any third-party cryptography dependencies.[cite:81][cite:83]
- Use session-oriented storage for unlocked state and persistent encrypted storage for vault-at-rest.[cite:81]
- Implement Drive first using `drive.file`, then Dropbox using PKCE.[cite:35][cite:89][cite:87][cite:43]

## Acceptance summary
The product is ready for v1 release when:
- A user can create an encrypted vault, add entries, and insert a selected value into a focused field reliably.
- Persistent storage and exported files contain ciphertext only for secret values.[cite:80][cite:81]
- A Pro user can sync the encrypted vault through Google Drive across at least two Chromium desktop browsers/devices using the same master password.[cite:35][cite:86]
- Paid feature boundaries are clear and compliant in listing and UI.[cite:59]
- The extension works on Chrome and can be ported to Edge with minimal change.[cite:20][cite:21][cite:27]
