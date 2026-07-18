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

test("unknown route returns not_found", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/missing`);
        const body = await response.json();

        assert.equal(response.status, 404);
        assert.deepEqual(body, { error: "not_found" });
    });
});
