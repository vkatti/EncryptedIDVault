import http from "node:http";

import { fileURLToPath } from "node:url";

export function createServer() {
    return http.createServer((request, response) => {
        if (request.url === "/health") {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: true }));
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
