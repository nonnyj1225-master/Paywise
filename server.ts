// Production server for PayWise.
// Serves API routes from src/api/router.ts and static frontend from dist/.
// Run `bun run build` before starting.
import { handleApiRequest } from "./src/api/router.ts";

const PORT = 3000;
const HOST = "0.0.0.0";

// ── Rate Limiting ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const RATE_LIMITED_PATHS = new Set([
  "POST /api/auth/login",
  "POST /api/auth/register",
]);

function getRateLimitKey(req: Request): string {
  // Use X-Forwarded-For if behind proxy, otherwise use the connecting IP
  const xff = req.headers.get("X-Forwarded-For");
  const ip = xff ? xff.split(",")[0].trim() : "0.0.0.0";
  return ip;
}

function checkRateLimit(req: Request): Response | null {
  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const routeKey = `${method} ${url.pathname}`;

  if (!RATE_LIMITED_PATHS.has(routeKey)) return null;

  const key = getRateLimitKey(req);
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Try again in 15 minutes." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return null;
}

function recordRateLimit(req: Request, isFailedAuth: boolean) {
  if (!isFailedAuth) return; // only count failures

  const method = req.method.toUpperCase();
  const url = new URL(req.url);
  const routeKey = `${method} ${url.pathname}`;

  if (!RATE_LIMITED_PATHS.has(routeKey)) return;

  const key = getRateLimitKey(req);
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count += 1;
  }

  // Clean up stale entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) {
      if (now >= v.resetAt) rateLimitMap.delete(k);
    }
  }
}

// ── Security Headers ──

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function addSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ── Body Size Limit ──
const MAX_BODY_SIZE = 10 * 1024; // 10KB

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

        // Rate limit check (before processing)
        const rateLimitResponse = checkRateLimit(req);
        if (rateLimitResponse) {
          return addSecurityHeaders(rateLimitResponse);
        }

        // Body size check for API endpoints
        if (
          url.pathname.startsWith("/api/") &&
          (req.method === "POST" || req.method === "PUT")
        ) {
          const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
          if (contentLength > MAX_BODY_SIZE) {
            return addSecurityHeaders(
              new Response(JSON.stringify({ error: "Request body too large" }), {
                status: 413,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
        }

        // API routes
        if (url.pathname.startsWith("/api/")) {
          const response = await handleApiRequest(req);

          // Track failed auth for rate limiting
          if (
            response.status === 401 &&
            (url.pathname === "/api/auth/login" || url.pathname === "/api/auth/register")
          ) {
            recordRateLimit(req, true);
          }

          return addSecurityHeaders(response);
        }

        // Static files from dist/
        const filePath = `dist${url.pathname === "/" ? "/index.html" : url.pathname}`;
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return addSecurityHeaders(new Response(file));
        }

        // SPA fallback: serve index.html for client-side routing
        const indexFile = Bun.file("dist/index.html");
        if (await indexFile.exists()) {
          return addSecurityHeaders(new Response(indexFile));
        }

        return addSecurityHeaders(
          new Response("Not found", { status: 404 })
        );
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`PayWise serving on http://${HOST}:${String(PORT)}`);
