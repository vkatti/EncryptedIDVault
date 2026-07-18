import http from "node:http";
import crypto from "node:crypto";

import { fileURLToPath } from "node:url";

const ENTITLEMENT_SIGNING_SECRET = process.env.EIV_BILLING_SIGNING_SECRET ?? "dev-only-secret-change-me";
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "dev-razorpay-webhook-secret";
const RAZORPAY_PRO_MONTHLY_PLAN_ID = process.env.RAZORPAY_PRO_MONTHLY_PLAN_ID ?? "";
const RAZORPAY_PRO_YEARLY_PLAN_ID = process.env.RAZORPAY_PRO_YEARLY_PLAN_ID ?? "";
const RAZORPAY_LIFETIME_AMOUNT_INR = Number(process.env.RAZORPAY_LIFETIME_AMOUNT_INR ?? "1999");
const APP_CHECKOUT_CALLBACK_URL = process.env.APP_CHECKOUT_CALLBACK_URL ?? "https://example.com/billing/callback";

function readJsonBody(request) {
    return new Promise((resolve) => {
        const chunks = [];

        request.on("data", (chunk) => {
            chunks.push(chunk);
        });

        request.on("end", () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }

            const raw = Buffer.concat(chunks).toString("utf8");

            try {
                resolve(JSON.parse(raw));
            } catch {
                resolve(null);
            }
        });
    });
}

function readRawBody(request) {
    return new Promise((resolve) => {
        const chunks = [];

        request.on("data", (chunk) => {
            chunks.push(chunk);
        });

        request.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
    });
}

function toIsoFromUnixSeconds(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    return new Date(value * 1000).toISOString();
}

function getPlanTier(plan) {
    if (plan === "lifetime") {
        return "lifetime";
    }

    return "pro";
}

function createRazorpayClient(options = {}) {
    const keyId = options.keyId ?? RAZORPAY_KEY_ID;
    const keySecret = options.keySecret ?? RAZORPAY_KEY_SECRET;
    const monthlyPlanId = options.monthlyPlanId ?? RAZORPAY_PRO_MONTHLY_PLAN_ID;
    const yearlyPlanId = options.yearlyPlanId ?? RAZORPAY_PRO_YEARLY_PLAN_ID;
    const lifetimeAmountInr = options.lifetimeAmountInr ?? RAZORPAY_LIFETIME_AMOUNT_INR;
    const callbackUrl = options.callbackUrl ?? APP_CHECKOUT_CALLBACK_URL;
    const fetchFn = options.fetchFn ?? fetch;

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    return {
        isConfigured() {
            return keyId.length > 0 && keySecret.length > 0;
        },
        webhookSecret: options.webhookSecret ?? RAZORPAY_WEBHOOK_SECRET,
        async createCheckoutForPlan(params) {
            const { accountId, plan, email } = params;

            if (!this.isConfigured()) {
                return { ok: false, error: "billing_provider_not_configured" };
            }

            if (plan === "pro-monthly" || plan === "pro-yearly") {
                const planId = plan === "pro-monthly" ? monthlyPlanId : yearlyPlanId;

                if (!planId) {
                    return { ok: false, error: "missing_subscription_plan_id" };
                }

                const response = await fetchFn(`${RAZORPAY_API_BASE}/subscriptions`, {
                    method: "POST",
                    headers: {
                        Authorization: authHeader,
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        plan_id: planId,
                        total_count: 1200,
                        customer_notify: 1,
                        notes: {
                            accountId,
                            plan,
                            email
                        }
                    })
                });

                const payload = await response.json();
                if (!response.ok || typeof payload?.short_url !== "string" || typeof payload?.id !== "string") {
                    return {
                        ok: false,
                        error: "billing_provider_error",
                        details: payload
                    };
                }

                return {
                    ok: true,
                    checkoutUrl: payload.short_url,
                    externalId: payload.id,
                    flow: "subscription"
                };
            }

            if (plan === "lifetime") {
                const amountPaise = Math.max(1, Math.floor(lifetimeAmountInr * 100));

                const response = await fetchFn(`${RAZORPAY_API_BASE}/payment_links`, {
                    method: "POST",
                    headers: {
                        Authorization: authHeader,
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        amount: amountPaise,
                        currency: "INR",
                        accept_partial: false,
                        reference_id: `${accountId}-${Date.now()}`,
                        description: "Encrypted ID Vault Lifetime",
                        customer: {
                            email
                        },
                        callback_url: callbackUrl,
                        callback_method: "get",
                        notes: {
                            accountId,
                            plan,
                            email
                        }
                    })
                });

                const payload = await response.json();
                if (!response.ok || typeof payload?.short_url !== "string" || typeof payload?.id !== "string") {
                    return {
                        ok: false,
                        error: "billing_provider_error",
                        details: payload
                    };
                }

                return {
                    ok: true,
                    checkoutUrl: payload.short_url,
                    externalId: payload.id,
                    flow: "payment_link"
                };
            }

            return { ok: false, error: "unsupported_plan" };
        }
    };
}

function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
    if (!signature || !secret) {
        return false;
    }

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (signature.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function createSignedEntitlement(account) {
    const payload = {
        accountId: account.accountId,
        tier: account.tier,
        state: account.state,
        expiresAt: account.expiresAt,
        issuedAt: new Date().toISOString()
    };

    const canonical = `${payload.accountId}|${payload.tier}|${payload.state}|${payload.expiresAt ?? ""}|${payload.issuedAt}`;
    const signature = crypto.createHash("sha256").update(`${ENTITLEMENT_SIGNING_SECRET}|${canonical}`).digest("hex");
    return { payload, signature };
}

export function createServer(options = {}) {
    const razorpayClient = options.razorpayClient ?? createRazorpayClient();
    const now = options.now ?? (() => new Date().toISOString());
    const accounts = new Map();

    function getAccountByExternalId(entityId) {
        for (const account of accounts.values()) {
            if (account.subscriptionId === entityId || account.paymentLinkId === entityId) {
                return account;
            }
        }

        return null;
    }

    function enforceExpiry(account) {
        if (account.tier !== "pro" || account.state !== "active" || !account.expiresAt) {
            return;
        }

        if (new Date(account.expiresAt).getTime() <= new Date(now()).getTime()) {
            account.state = "expired";
        }
    }

    return http.createServer((request, response) => {
        if (request.url === "/health") {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: true }));
            return;
        }

        if (request.url === "/billing/link-account" && request.method === "POST") {
            void (async () => {
                const body = await readJsonBody(request);

                if (!body || typeof body.email !== "string" || body.email.trim().length === 0) {
                    response.writeHead(400, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "invalid_account_payload" }));
                    return;
                }

                const normalizedEmail = body.email.trim().toLowerCase();
                const accountId = `acct_${crypto.createHash("sha1").update(normalizedEmail).digest("hex").slice(0, 12)}`;
                const existing = accounts.get(accountId);

                if (!existing) {
                    accounts.set(accountId, {
                        accountId,
                        email: normalizedEmail,
                        tier: "free",
                        state: "active",
                        expiresAt: null,
                        pendingPlan: null,
                        subscriptionId: null,
                        paymentLinkId: null,
                        updatedAt: now()
                    });
                }

                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify({ ok: true, accountId }));
            })();
            return;
        }

        if (request.url === "/billing/checkout-session" && request.method === "POST") {
            void (async () => {
                const body = await readJsonBody(request);

                if (!body || typeof body.accountId !== "string" || typeof body.plan !== "string") {
                    response.writeHead(400, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "invalid_checkout_payload" }));
                    return;
                }

                const account = accounts.get(body.accountId);
                if (!account) {
                    response.writeHead(404, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "account_not_found" }));
                    return;
                }

                if (body.plan !== "lifetime" && body.plan !== "pro-monthly" && body.plan !== "pro-yearly") {
                    response.writeHead(400, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "unsupported_plan" }));
                    return;
                }

                const checkout = await razorpayClient.createCheckoutForPlan({
                    accountId: account.accountId,
                    plan: body.plan,
                    email: account.email
                });

                if (!checkout.ok) {
                    const statusCode = checkout.error === "billing_provider_not_configured" ? 503 : 502;
                    response.writeHead(statusCode, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: checkout.error, details: checkout.details ?? null }));
                    return;
                }

                account.pendingPlan = body.plan;
                account.updatedAt = now();

                if (checkout.flow === "subscription") {
                    account.subscriptionId = checkout.externalId;
                }

                if (checkout.flow === "payment_link") {
                    account.paymentLinkId = checkout.externalId;
                }

                response.writeHead(200, { "content-type": "application/json" });
                response.end(
                    JSON.stringify({
                        ok: true,
                        checkoutUrl: checkout.checkoutUrl,
                        provider: "razorpay",
                        externalId: checkout.externalId,
                        flow: checkout.flow
                    })
                );
            })();
            return;
        }

        if (request.url?.startsWith("/billing/entitlement") && request.method === "GET") {
            const requestUrl = new URL(request.url, "http://localhost");
            const accountId = requestUrl.searchParams.get("accountId")?.trim();

            if (!accountId) {
                response.writeHead(400, { "content-type": "application/json" });
                response.end(JSON.stringify({ ok: false, error: "missing_account_id" }));
                return;
            }

            const account = accounts.get(accountId);
            if (!account) {
                response.writeHead(404, { "content-type": "application/json" });
                response.end(JSON.stringify({ ok: false, error: "account_not_found" }));
                return;
            }

            enforceExpiry(account);

            const signedEntitlement = createSignedEntitlement(account);
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: true, entitlement: signedEntitlement.payload, signature: signedEntitlement.signature }));
            return;
        }

        if (request.url === "/webhooks/razorpay" && request.method === "POST") {
            void (async () => {
                const rawBody = await readRawBody(request);
                const signature = request.headers["x-razorpay-signature"];
                const signatureValue = Array.isArray(signature) ? signature[0] : signature;

                const isValidSignature = verifyRazorpayWebhookSignature(rawBody, signatureValue, razorpayClient.webhookSecret);

                if (!isValidSignature) {
                    response.writeHead(401, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "invalid_webhook_signature" }));
                    return;
                }

                let eventPayload;
                try {
                    eventPayload = JSON.parse(rawBody);
                } catch {
                    response.writeHead(400, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "invalid_webhook_payload" }));
                    return;
                }

                const eventType = eventPayload?.event;
                const entity = eventPayload?.payload?.subscription?.entity ?? eventPayload?.payload?.payment_link?.entity ?? null;
                const notes = entity?.notes ?? {};
                const accountId = typeof notes.accountId === "string" ? notes.accountId : null;
                const account = accountId ? accounts.get(accountId) : getAccountByExternalId(entity?.id ?? null);

                if (!account) {
                    response.writeHead(200, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: true, ignored: true, reason: "account_not_found" }));
                    return;
                }

                if (eventType === "subscription.activated" || eventType === "subscription.charged") {
                    account.tier = getPlanTier(account.pendingPlan ?? "pro-monthly");
                    account.state = "active";
                    account.expiresAt = toIsoFromUnixSeconds(entity?.current_end);
                    account.pendingPlan = null;
                    account.subscriptionId = entity?.id ?? account.subscriptionId;
                    account.updatedAt = now();
                }

                if (eventType === "subscription.cancelled" || eventType === "subscription.halted" || eventType === "subscription.completed") {
                    account.state = "expired";
                    account.expiresAt = toIsoFromUnixSeconds(entity?.current_end) ?? account.expiresAt;
                    account.pendingPlan = null;
                    account.subscriptionId = entity?.id ?? account.subscriptionId;
                    account.updatedAt = now();
                }

                if (eventType === "payment_link.paid") {
                    account.tier = getPlanTier(account.pendingPlan ?? "lifetime");
                    account.state = "active";
                    account.expiresAt = null;
                    account.pendingPlan = null;
                    account.paymentLinkId = entity?.id ?? account.paymentLinkId;
                    account.updatedAt = now();
                }

                if (eventType === "payment_link.cancelled" || eventType === "payment_link.expired") {
                    if (account.tier === "free") {
                        account.state = "active";
                    }
                    account.pendingPlan = null;
                    account.paymentLinkId = entity?.id ?? account.paymentLinkId;
                    account.updatedAt = now();
                }

                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify({ ok: true }));
            })();
            return;
        }

        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
    });
}

export function startServer(port = 3000) {
    const server = createServer();
    server.listen(port);
    return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    startServer(3000);
}
