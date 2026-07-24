import { getDb } from "../db";

// ── helpers ──

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json()) as Record<string, unknown>;
  }
  return {};
}

// ── token generation ──

export function generateToken(): string {
  return crypto.randomUUID!();
}

// ── auth middleware ──

/**
 * Extracts the user ID from the Authorization Bearer token.
 * Returns the user ID on success, or a 401 Response on failure.
 */
export function authenticateUser(req: Request): number | Response {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return error("Unauthorized", 401);
  }
  const token = authHeader.slice(7);
  const db = getDb();
  const user = db
    .query("SELECT id FROM users WHERE session_token = ?")
    .get(token) as { id: number } | null;
  if (!user) {
    return error("Invalid session", 401);
  }
  return user.id;
}

// ── auth request handler ──

export async function handleAuthRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/auth/me
  if (path === "/api/auth/me" && req.method === "GET") {
    const result = authenticateUser(req);
    if (typeof result !== "number") return result;
    const db = getDb();
    const user = db
      .query("SELECT id, email, created_at FROM users WHERE id = ?")
      .get(result) as { id: number; email: string; created_at: string } | null;
    if (!user) return error("User not found", 404);
    return json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
  }

  // POST /api/auth/register
  if (path === "/api/auth/register" && req.method === "POST") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return error("Email and password are required", 400);
    }
    if (password.length < 6) {
      return error("Password must be at least 6 characters", 400);
    }
    // Basic email format check
    if (!email.includes("@") || !email.includes(".")) {
      return error("Invalid email format", 400);
    }

    const db = getDb();

    // Check for existing user with this email
    const existing = db
      .query("SELECT id FROM users WHERE email = ?")
      .get(email) as { id: number } | null;
    if (existing) {
      return error("An account with this email already exists", 409);
    }

    const passwordHash = await Bun.password.hash(password);
    const token = generateToken();

    db.run(
      "INSERT INTO users (email, password_hash, session_token, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
      [email, passwordHash, token]
    );

    const user = db
      .query("SELECT id, email, created_at FROM users WHERE id = last_insert_rowid()")
      .get() as { id: number; email: string; created_at: string };

    return json({ user: { id: user.id, email: user.email }, token }, 201);
  }

  // POST /api/auth/login
  if (path === "/api/auth/login" && req.method === "POST") {
    const body = await parseBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return error("Email and password are required", 400);
    }

    const db = getDb();
    const user = db
      .query("SELECT id, email, password_hash FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; password_hash: string } | null;

    if (!user) {
      return error("Invalid email or password", 401);
    }

    const valid = await Bun.password.verify(password, user.password_hash);
    if (!valid) {
      return error("Invalid email or password", 401);
    }

    const token = generateToken();
    db.run("UPDATE users SET session_token = ?, updated_at = datetime('now') WHERE id = ?", [
      token,
      user.id,
    ]);

    return json({
      user: { id: user.id, email: user.email },
      token,
    });
  }

  // POST /api/auth/logout
  if (path === "/api/auth/logout" && req.method === "POST") {
    const result = authenticateUser(req);
    if (typeof result !== "number") {
      // If not authenticated, still return success — client is logging out anyway
      return json({ ok: true });
    }
    const db = getDb();
    db.run("UPDATE users SET session_token = NULL, updated_at = datetime('now') WHERE id = ?", [
      result,
    ]);
    return json({ ok: true });
  }

  return error("Not found", 404);
}
