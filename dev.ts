// Dev server for PayWise.
// Runs Vite dev server with an API-intercepting plugin on port 3000.
import { createServer, type Plugin } from "vite";
import { handleApiRequest } from "./src/api/router.ts";

const PORT = 3000;
const HOST = "0.0.0.0";

// Free the port first
const freePort = `sudo sh -c 'lsof -t -iTCP:${PORT} -sTCP:LISTEN | xargs -r kill' 2>/dev/null`;
await Bun.$`sh -c ${freePort}`.quiet().nothrow();
await Bun.sleep(200);

const apiPlugin: Plugin = {
  name: "paywise-api",
  configureServer(server) {
    // Add middleware BEFORE Vite's HTML fallback
    server.middlewares.use(async (nodeReq, nodeRes, next) => {
      const url = nodeReq.url || "";
      if (url.startsWith("/api/")) {
        try {
          // Build a web-standard Request from the node request
          const headers = new Headers();
          for (const [k, v] of Object.entries(nodeReq.headers)) {
            if (typeof v === "string") headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join(", "));
          }

          let body: BodyInit | null = null;
          if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
            const chunks: Buffer[] = [];
            for await (const chunk of nodeReq) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
            }
            if (chunks.length > 0) {
              body = Buffer.concat(chunks);
            }
          }

          const webReq = new Request(`http://${nodeReq.headers.host || "localhost"}${url}`, {
            method: nodeReq.method,
            headers,
            body,
          });

          const response = await handleApiRequest(webReq);

          nodeRes.statusCode = response.status;
          response.headers.forEach((v, k) => nodeRes.setHeader(k, v));
          const resBody = await response.arrayBuffer();
          nodeRes.end(Buffer.from(resBody));
        } catch (err) {
          console.error("API error:", err);
          nodeRes.statusCode = 500;
          nodeRes.setHeader("Content-Type", "application/json");
          nodeRes.end(JSON.stringify({ error: "Internal server error" }));
        }
        return;
      }
      next();
    });
  },
};

const vite = await createServer({
  server: {
    port: PORT,
    host: HOST,
    allowedHosts: true,
  },
  appType: "spa",
  plugins: [apiPlugin],
});

await vite.listen();

console.log(`PayWise dev server on http://${HOST}:${String(PORT)}`);
