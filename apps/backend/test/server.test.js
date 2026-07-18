import assert from "node:assert/strict";
import test from "node:test";

import { createServer } from "../src/server.js";

async function withServer(run) {
    const server = createServer();

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

test("POST /webhooks/razorpay returns placeholder not implemented response", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/webhooks/razorpay`, { method: "POST" });
        const body = await response.json();

        assert.equal(response.status, 501);
        assert.deepEqual(body, { ok: false, error: "webhook_not_implemented", provider: "razorpay" });
    });
});

test("billing flow links account, upgrades plan, and returns signed entitlement", async () => {
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
        assert.equal(checkoutBody.checkoutUrl.includes("pro-monthly"), true);

        const entitlementResponse = await fetch(`${baseUrl}/billing/entitlement?accountId=${encodeURIComponent(linkBody.accountId)}`);
        const entitlementBody = await entitlementResponse.json();

        assert.equal(entitlementResponse.status, 200);
        assert.equal(entitlementBody.ok, true);
        assert.equal(entitlementBody.entitlement.accountId, linkBody.accountId);
        assert.equal(entitlementBody.entitlement.tier, "pro");
        assert.equal(entitlementBody.entitlement.state, "active");
        assert.equal(typeof entitlementBody.signature, "string");
        assert.equal(entitlementBody.signature.length > 10, true);
    });
});

test("unknown route returns not_found", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/missing`);
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.deepEqual(body, { error: "not_found" });
    });
});
