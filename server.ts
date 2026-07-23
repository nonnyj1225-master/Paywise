// Production server for PayWise.
// Serves API routes from src/api/router.ts and static frontend from dist/.
// Run `bun run build` before starting.
import { handleApiRequest } from "./src/api/router.ts";

const PORT = 3000;
const HOST = "0.0.0.0";

// Free PORT regardless of which user owns the current listener
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const url = new URL(req.url);

        // API routes
        if (url.pathname.startsWith("/api/")) {
          return handleApiRequest(req);
        }

        // Static files from dist/
        const filePath = `dist${url.pathname === "/" ? "/index.html" : url.pathname}`;
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }

        // SPA fallback: serve index.html for client-side routing
        const indexFile = Bun.file("dist/index.html");
        if (await indexFile.exists()) {
          return new Response(indexFile);
        }

        return new Response("Not found", { status: 404 });
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`PayWise serving on http://${HOST}:${String(PORT)}`);
