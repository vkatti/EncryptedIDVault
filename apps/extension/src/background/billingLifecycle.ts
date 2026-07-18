import type { BillingPlan, EntitlementState, EntitlementTier } from "@encrypted-id-vault/shared";

type SyncProvider = "drive" | "dropbox" | null;

type EntitlementPayload = {
    accountId: string;
    tier: EntitlementTier;
    state: EntitlementState;
    expiresAt: string | null;
    issuedAt: string;
};

type BillingCache = {
    accountId: string | null;
    entitlement: EntitlementPayload | null;
    signature: string | null;
    checkedAt: string | null;
    syncProvider: SyncProvider;
};

export type BillingEntitlementSnapshot = {
    accountId: string | null;
    tier: EntitlementTier;
    state: EntitlementState;
    expiresAt: string | null;
    checkedAt: string | null;
    source: "network" | "cache" | "default";
    syncProvider: SyncProvider;
    syncEnabled: boolean;
};

export type BillingActionResult<T> =
    | {
        ok: true;
        value: T;
    }
    | {
        ok: false;
        error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" | "ERR_SYNC_REQUIRES_PRO";
    };

export interface BillingLifecycle {
    initialize(): Promise<void>;
    getSnapshot(): BillingEntitlementSnapshot;
    linkAccount(email: string): Promise<BillingActionResult<{ accountId: string }>>;
    startCheckout(plan: BillingPlan): Promise<BillingActionResult<{ checkoutUrl: string }>>;
    getEntitlement(forceRefresh?: boolean): Promise<BillingActionResult<BillingEntitlementSnapshot>>;
    setSyncProvider(provider: SyncProvider): Promise<BillingActionResult<{ provider: SyncProvider }>>;
    requestSync(action: "push" | "pull"): Promise<BillingActionResult<{ action: "push" | "pull"; provider: Exclude<SyncProvider, null> }>>;
}

const BILLING_STORAGE_KEY = "billingState";
const DEFAULT_BILLING_API_BASE = "http://127.0.0.1:3000";
const ENTITLEMENT_SIGNING_SECRET = "dev-only-secret-change-me";

const DEFAULT_CACHE: BillingCache = {
    accountId: null,
    entitlement: null,
    signature: null,
    checkedAt: null,
    syncProvider: null
};

function normalizeSnapshot(cache: BillingCache, source: BillingEntitlementSnapshot["source"]): BillingEntitlementSnapshot {
    const tier = cache.entitlement?.tier ?? "free";
    const state = cache.entitlement?.state ?? "active";
    const expiresAt = cache.entitlement?.expiresAt ?? null;
    const syncEnabled = (tier === "pro" || tier === "lifetime") && (state === "active" || state === "grace");

    return {
        accountId: cache.accountId,
        tier,
        state,
        expiresAt,
        checkedAt: cache.checkedAt,
        source,
        syncProvider: cache.syncProvider,
        syncEnabled
    };
}

function isEntitlementPayload(value: unknown): value is EntitlementPayload {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<EntitlementPayload>;
    return (
        typeof candidate.accountId === "string" &&
        (candidate.tier === "free" || candidate.tier === "pro" || candidate.tier === "lifetime") &&
        (candidate.state === "active" || candidate.state === "grace" || candidate.state === "expired" || candidate.state === "unknown") &&
        (candidate.expiresAt === null || typeof candidate.expiresAt === "string") &&
        typeof candidate.issuedAt === "string"
    );
}

async function sha256Hex(input: string): Promise<string> {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}

function toCanonical(payload: EntitlementPayload): string {
    return `${payload.accountId}|${payload.tier}|${payload.state}|${payload.expiresAt ?? ""}|${payload.issuedAt}`;
}

async function verifyEntitlementSignature(payload: EntitlementPayload, signature: string): Promise<boolean> {
    const expected = await sha256Hex(`${ENTITLEMENT_SIGNING_SECRET}|${toCanonical(payload)}`);
    return expected === signature;
}

export function createBillingLifecycle(storage: chrome.storage.StorageArea = chrome.storage.local): BillingLifecycle {
    let cache: BillingCache = { ...DEFAULT_CACHE };

    const saveCache = async (): Promise<void> => {
        await storage.set({ [BILLING_STORAGE_KEY]: cache });
    };

    const loadCache = async (): Promise<void> => {
        const stored = await storage.get([BILLING_STORAGE_KEY]);
        const value = stored[BILLING_STORAGE_KEY];

        if (!value || typeof value !== "object") {
            cache = { ...DEFAULT_CACHE };
            return;
        }

        const candidate = value as Partial<BillingCache>;
        cache = {
            accountId: typeof candidate.accountId === "string" ? candidate.accountId : null,
            entitlement: isEntitlementPayload(candidate.entitlement) ? candidate.entitlement : null,
            signature: typeof candidate.signature === "string" ? candidate.signature : null,
            checkedAt: typeof candidate.checkedAt === "string" ? candidate.checkedAt : null,
            syncProvider: candidate.syncProvider === "drive" || candidate.syncProvider === "dropbox" ? candidate.syncProvider : null
        };
    };

    const refreshFromNetwork = async (): Promise<BillingActionResult<BillingEntitlementSnapshot>> => {
        if (!cache.accountId) {
            return { ok: true, value: normalizeSnapshot(cache, "default") };
        }

        try {
            const response = await fetch(`${DEFAULT_BILLING_API_BASE}/billing/entitlement?accountId=${encodeURIComponent(cache.accountId)}`);
            const data = (await response.json()) as unknown;

            if (!response.ok || !data || typeof data !== "object") {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }

            const parsed = data as { ok?: boolean; entitlement?: unknown; signature?: unknown };
            if (parsed.ok !== true || !isEntitlementPayload(parsed.entitlement) || typeof parsed.signature !== "string") {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }

            const isValid = await verifyEntitlementSignature(parsed.entitlement, parsed.signature);
            if (!isValid) {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }

            cache = {
                ...cache,
                entitlement: parsed.entitlement,
                signature: parsed.signature,
                checkedAt: new Date().toISOString()
            };
            await saveCache();

            return { ok: true, value: normalizeSnapshot(cache, "network") };
        } catch {
            if (cache.entitlement) {
                return { ok: true, value: normalizeSnapshot(cache, "cache") };
            }

            return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
        }
    };

    return {
        async initialize() {
            await loadCache();
        },
        getSnapshot() {
            if (cache.entitlement) {
                return normalizeSnapshot(cache, "cache");
            }

            return normalizeSnapshot(cache, "default");
        },
        async linkAccount(email) {
            try {
                const response = await fetch(`${DEFAULT_BILLING_API_BASE}/billing/link-account`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email })
                });
                const data = (await response.json()) as unknown;

                if (!response.ok || !data || typeof data !== "object") {
                    return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
                }

                const parsed = data as { ok?: boolean; accountId?: unknown };
                if (parsed.ok !== true || typeof parsed.accountId !== "string") {
                    return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
                }

                cache = {
                    ...cache,
                    accountId: parsed.accountId
                };
                await saveCache();

                return { ok: true, value: { accountId: parsed.accountId } };
            } catch {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }
        },
        async startCheckout(plan) {
            if (!cache.accountId) {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }

            try {
                const response = await fetch(`${DEFAULT_BILLING_API_BASE}/billing/checkout-session`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ accountId: cache.accountId, plan })
                });
                const data = (await response.json()) as unknown;

                if (!response.ok || !data || typeof data !== "object") {
                    return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
                }

                const parsed = data as { ok?: boolean; checkoutUrl?: unknown };
                if (parsed.ok !== true || typeof parsed.checkoutUrl !== "string") {
                    return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
                }

                void refreshFromNetwork();
                return { ok: true, value: { checkoutUrl: parsed.checkoutUrl } };
            } catch {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }
        },
        async getEntitlement(forceRefresh = false) {
            if (!forceRefresh && cache.entitlement) {
                return { ok: true, value: normalizeSnapshot(cache, "cache") };
            }

            return refreshFromNetwork();
        },
        async setSyncProvider(provider) {
            cache = {
                ...cache,
                syncProvider: provider
            };
            await saveCache();

            return { ok: true, value: { provider } };
        },
        async requestSync(action) {
            const entitlement = await this.getEntitlement(false);

            if (!entitlement.ok || !entitlement.value.syncEnabled) {
                return { ok: false, error: "ERR_SYNC_REQUIRES_PRO" };
            }

            if (!cache.syncProvider) {
                return { ok: false, error: "ERR_BILLING_ENTITLEMENT_UNKNOWN" };
            }

            return {
                ok: true,
                value: {
                    action,
                    provider: cache.syncProvider
                }
            };
        }
    };
}
