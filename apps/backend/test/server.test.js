import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createServer } from "../src/server.js";

function createRazorpaySignature(rawBody, secret) {
    return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function createFakeRazorpayClient() {
    return {
        webhookSecret: "test-razorpay-webhook-secret",
        isConfigured() {
            return true;
        },
        async createCheckoutForPlan({ accountId, plan }) {
            if (plan === "lifetime") {
                return {
                    ok: true,
                    checkoutUrl: `https://rzp.test/lifetime/${accountId}`,
                    externalId: "plink_test_1",
                    flow: "payment_link"
                };
            }

            return {
                ok: true,
                checkoutUrl: `https://rzp.test/subscription/${accountId}`,
                externalId: "sub_test_1",
                flow: "subscription"
            };
        }
    };
}

async function withServer(run, options = {}) {
    const server = createServer(options);

    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        await run(baseUrl);
    } finally {
        await new Promise((resolve) => {
            server.close(resolve);
        });
    }
}

test("GET /health returns ok payload", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.deepEqual(body, { ok: true });
    });
});

test("POST /webhooks/razorpay rejects invalid webhook signatures", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/webhooks/razorpay`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-razorpay-signature": "invalid"
            },
            body: JSON.stringify({ event: "payment_link.paid" })
        });
        const body = await response.json();

        assert.equal(response.status, 401);
        assert.deepEqual(body, { ok: false, error: "invalid_webhook_signature" });
    }, { razorpayClient: createFakeRazorpayClient() });
});

test("billing flow links account, starts Razorpay checkout, and activates entitlement via webhook", async () => {
    await withServer(async (baseUrl) => {
        const linkResponse = await fetch(`${baseUrl}/billing/link-account`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "phase5@example.com" })
        });
        const linkBody = await linkResponse.json();

        assert.equal(linkResponse.status, 200);
        assert.equal(linkBody.ok, true);
        assert.equal(typeof linkBody.accountId, "string");

        const checkoutResponse = await fetch(`${baseUrl}/billing/checkout-session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accountId: linkBody.accountId, plan: "pro-monthly" })
        });
        const checkoutBody = await checkoutResponse.json();

        assert.equal(checkoutResponse.status, 200);
        assert.equal(checkoutBody.ok, true);
        assert.equal(typeof checkoutBody.checkoutUrl, "string");
        assert.equal(checkoutBody.provider, "razorpay");
        assert.equal(checkoutBody.flow, "subscription");

        const beforeEntitlementResponse = await fetch(`${baseUrl}/billing/entitlement?accountId=${encodeURIComponent(linkBody.accountId)}`);
        const beforeEntitlementBody = await beforeEntitlementResponse.json();

        assert.equal(beforeEntitlementResponse.status, 200);
        assert.equal(beforeEntitlementBody.entitlement.tier, "free");

        const webhookPayload = {
            event: "subscription.activated",
            payload: {
                subscription: {
                    entity: {
                        id: checkoutBody.externalId,
                        current_end: 1794412800,
                        notes: {
                            accountId: linkBody.accountId,
                            plan: "pro-monthly"
                        }
                    }
                }
            }
        };
        const rawWebhookBody = JSON.stringify(webhookPayload);
        const signature = createRazorpaySignature(rawWebhookBody, "test-razorpay-webhook-secret");

        const webhookResponse = await fetch(`${baseUrl}/webhooks/razorpay`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-razorpay-signature": signature
            },
            body: rawWebhookBody
        });
        const webhookBody = await webhookResponse.json();

        assert.equal(webhookResponse.status, 200);
        assert.deepEqual(webhookBody, { ok: true });

        const entitlementResponse = await fetch(`${baseUrl}/billing/entitlement?accountId=${encodeURIComponent(linkBody.accountId)}`);
        const entitlementBody = await entitlementResponse.json();

        assert.equal(entitlementResponse.status, 200);
        assert.equal(entitlementBody.ok, true);
        assert.equal(entitlementBody.entitlement.accountId, linkBody.accountId);
        assert.equal(entitlementBody.entitlement.tier, "pro");
        assert.equal(entitlementBody.entitlement.state, "active");
        assert.equal(typeof entitlementBody.entitlement.expiresAt, "string");
        assert.equal(typeof entitlementBody.signature, "string");
        assert.equal(entitlementBody.signature.length > 10, true);
    }, { razorpayClient: createFakeRazorpayClient() });
});

test("lifetime checkout activates lifetime entitlement via payment_link.paid webhook", async () => {
    await withServer(async (baseUrl) => {
        const linkResponse = await fetch(`${baseUrl}/billing/link-account`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "lifetime@example.com" })
        });
        const linkBody = await linkResponse.json();

        const checkoutResponse = await fetch(`${baseUrl}/billing/checkout-session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accountId: linkBody.accountId, plan: "lifetime" })
        });
        const checkoutBody = await checkoutResponse.json();

        assert.equal(checkoutResponse.status, 200);
        assert.equal(checkoutBody.flow, "payment_link");

        const webhookPayload = {
            event: "payment_link.paid",
            payload: {
                payment_link: {
                    entity: {
                        id: checkoutBody.externalId,
                        notes: {
                            accountId: linkBody.accountId,
                            plan: "lifetime"
                        }
                    }
                }
            }
        };
        const rawWebhookBody = JSON.stringify(webhookPayload);
        const signature = createRazorpaySignature(rawWebhookBody, "test-razorpay-webhook-secret");

        await fetch(`${baseUrl}/webhooks/razorpay`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-razorpay-signature": signature
            },
            body: rawWebhookBody
        });

        const entitlementResponse = await fetch(`${baseUrl}/billing/entitlement?accountId=${encodeURIComponent(linkBody.accountId)}`);
        const entitlementBody = await entitlementResponse.json();

        assert.equal(entitlementResponse.status, 200);
        assert.equal(entitlementBody.entitlement.tier, "lifetime");
        assert.equal(entitlementBody.entitlement.state, "active");
        assert.equal(entitlementBody.entitlement.expiresAt, null);
    }, { razorpayClient: createFakeRazorpayClient() });
});

test("unknown route returns not_found", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/missing`);
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.deepEqual(body, { error: "not_found" });
    });
});
