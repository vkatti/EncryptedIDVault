import http from "node:http";
import crypto from "node:crypto";

import { fileURLToPath } from "node:url";

const ENTITLEMENT_SIGNING_SECRET = process.env.EIV_BILLING_SIGNING_SECRET ?? "dev-only-secret-change-me";

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

export function createServer() {
    const accounts = new Map();

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
                        expiresAt: null
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

                const now = new Date();
                if (body.plan === "lifetime") {
                    account.tier = "lifetime";
                    account.state = "active";
                    account.expiresAt = null;
                } else if (body.plan === "pro-monthly" || body.plan === "pro-yearly") {
                    account.tier = "pro";
                    account.state = "active";
                    const expiry = new Date(now);
                    expiry.setUTCDate(expiry.getUTCDate() + (body.plan === "pro-yearly" ? 365 : 30));
                    account.expiresAt = expiry.toISOString();
                } else {
                    response.writeHead(400, { "content-type": "application/json" });
                    response.end(JSON.stringify({ ok: false, error: "unsupported_plan" }));
                    return;
                }

                response.writeHead(200, { "content-type": "application/json" });
                response.end(
                    JSON.stringify({
                        ok: true,
                        checkoutUrl: `https://billing.example.test/checkout?accountId=${encodeURIComponent(account.accountId)}&plan=${encodeURIComponent(body.plan)}`
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

            const signedEntitlement = createSignedEntitlement(account);
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: true, entitlement: signedEntitlement.payload, signature: signedEntitlement.signature }));
            return;
        }

        if (request.url === "/webhooks/stripe") {
            response.writeHead(501, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: false, error: "webhook_not_implemented", provider: "stripe" }));
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
