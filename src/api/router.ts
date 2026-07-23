import { getDb, ensureUser } from "../db";

type JsonResponse = Record<string, unknown> | Array<unknown>;

function json(data: JsonResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function parseBody(req: Request): Promise<unknown> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) return req.json();
  return Promise.resolve({});
}

// --- Profiles ---

async function handleProfiles(req: Request): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  if (req.method === "GET") {
    const row = db.query("SELECT * FROM pay_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
    return json(row ? { profile: row } : { profile: null });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const hourlyRate = Number(body.hourly_rate) || 0;
    const payFrequency = String(body.pay_frequency || "bi-weekly");
    const region = String(body.region || "");
    const customTaxRate = body.custom_tax_rate != null ? Number(body.custom_tax_rate) : null;

    // Upsert: update existing or insert new
    const existing = db.query("SELECT id FROM pay_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as { id: number } | null;

    if (existing) {
      db.run(
        `UPDATE pay_profiles SET hourly_rate=?, pay_frequency=?, region=?, custom_tax_rate=?, updated_at=datetime('now') WHERE id=?`,
        [hourlyRate, payFrequency, region, customTaxRate, existing.id]
      );
      const row = db.query("SELECT * FROM pay_profiles WHERE id = ?").get(existing.id);
      return json({ profile: row }, 201);
    } else {
      db.run(
        `INSERT INTO pay_profiles (user_id, hourly_rate, pay_frequency, region, custom_tax_rate) VALUES (?, ?, ?, ?, ?)`,
        [userId, hourlyRate, payFrequency, region, customTaxRate]
      );
      const row = db.query("SELECT * FROM pay_profiles WHERE id = last_insert_rowid()").get();
      return json({ profile: row }, 201);
    }
  }

  return error("Method not allowed", 405);
}

// --- Pay Periods ---

async function handlePayPeriods(req: Request): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  if (req.method === "GET") {
    const rows = db.query("SELECT * FROM pay_periods WHERE user_id = ? ORDER BY end_date DESC LIMIT 20").all(userId);
    return json({ pay_periods: rows });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;

    // Get the user's profile for rate
    const profile = db.query("SELECT * FROM pay_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
    if (!profile) return error("No pay profile found. Create a profile first.", 400);

    const hoursWorked = Number(body.hours_worked) || 0;
    const hourlyRate = Number(profile.hourly_rate) || 0;
    const grossPay = hoursWorked * hourlyRate;

    // Calculate tax
    let taxRate = 0;
    if (profile.custom_tax_rate != null) {
      taxRate = Number(profile.custom_tax_rate);
    } else {
      // Simple regional tax estimate (stub — real lookup in future)
      taxRate = estimateTaxRate(String(profile.region || ""));
    }

    // Calculate insurance deductions
    const deductions = db.query("SELECT * FROM insurance_deductions WHERE user_id = ?").all(userId) as Array<Record<string, unknown>>;
    let insuranceTotal = 0;
    for (const d of deductions) {
      if (d.per_pay_period) {
        const pct = Number(d.percentage) || 0;
        const fixed = d.fixed_amount != null ? Number(d.fixed_amount) : 0;
        insuranceTotal += (grossPay * pct / 100) + fixed;
      }
    }

    const taxAmount = Math.round(grossPay * taxRate * 100) / 100;
    const netPay = Math.round((grossPay - taxAmount - insuranceTotal) * 100) / 100;

    const startDate = String(body.start_date || new Date().toISOString().split("T")[0]);
    const endDate = String(body.end_date || new Date().toISOString().split("T")[0]);

    db.run(
      `INSERT INTO pay_periods (user_id, pay_profile_id, hours_worked, gross_pay, tax_amount, net_pay, insurance_deductions, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, profile.id, hoursWorked, grossPay, taxAmount, netPay, insuranceTotal, startDate, endDate]
    );

    const row = db.query("SELECT * FROM pay_periods WHERE id = last_insert_rowid()").get();
    return json({ pay_period: row }, 201);
  }

  return error("Method not allowed", 405);
}

// --- Bills ---

async function handleBills(req: Request, billId?: string): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  if (req.method === "GET") {
    const rows = db.query("SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC").all(userId);
    return json({ bills: rows });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const name = String(body.name || "");
    const amount = Number(body.amount) || 0;
    const dueDate = String(body.due_date || "");
    const category = String(body.category || "other");
    const priority = Number(body.priority) || 3;
    const recurring = body.recurring ? 1 : 0;

    if (!name || !dueDate) return error("Name and due_date are required", 400);

    db.run(
      `INSERT INTO bills (user_id, name, amount, due_date, category, priority, recurring) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, amount, dueDate, category, priority, recurring]
    );

    const row = db.query("SELECT * FROM bills WHERE id = last_insert_rowid()").get();
    return json({ bill: row }, 201);
  }

  if (req.method === "PUT" && billId) {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const existing = db.query("SELECT * FROM bills WHERE id = ? AND user_id = ?").get(Number(billId), userId);
    if (!existing) return error("Bill not found", 404);

    const name = String(body.name ?? (existing as Record<string, unknown>).name);
    const amount = Number(body.amount ?? (existing as Record<string, unknown>).amount);
    const dueDate = String(body.due_date ?? (existing as Record<string, unknown>).due_date);
    const category = String(body.category ?? (existing as Record<string, unknown>).category);
    const priority = Number(body.priority ?? (existing as Record<string, unknown>).priority);
    const recurring = body.recurring != null ? (body.recurring ? 1 : 0) : (existing as Record<string, unknown>).recurring;

    db.run(
      `UPDATE bills SET name=?, amount=?, due_date=?, category=?, priority=?, recurring=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
      [name, amount, dueDate, category, priority, recurring, Number(billId), userId]
    );

    const row = db.query("SELECT * FROM bills WHERE id = ?").get(Number(billId));
    return json({ bill: row });
  }

  if (req.method === "DELETE" && billId) {
    const existing = db.query("SELECT * FROM bills WHERE id = ? AND user_id = ?").get(Number(billId), userId);
    if (!existing) return error("Bill not found", 404);

    db.run("DELETE FROM bills WHERE id = ? AND user_id = ?", [Number(billId), userId]);
    return json({ deleted: true });
  }

  return error("Method not allowed", 405);
}

// --- Insurance Deductions ---

async function handleInsuranceDeductions(req: Request): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  if (req.method === "GET") {
    const rows = db.query("SELECT * FROM insurance_deductions WHERE user_id = ?").all(userId);
    return json({ insurance_deductions: rows });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const name = String(body.name || "");
    const percentage = Number(body.percentage) || 0;
    const fixedAmount = body.fixed_amount != null ? Number(body.fixed_amount) : null;
    const perPayPeriod = body.per_pay_period !== false ? 1 : 0;

    if (!name) return error("Name is required", 400);

    db.run(
      `INSERT INTO insurance_deductions (user_id, name, percentage, fixed_amount, per_pay_period) VALUES (?, ?, ?, ?, ?)`,
      [userId, name, percentage, fixedAmount, perPayPeriod]
    );

    const row = db.query("SELECT * FROM insurance_deductions WHERE id = last_insert_rowid()").get();
    return json({ insurance_deduction: row }, 201);
  }

  return error("Method not allowed", 405);
}

// --- Projection ---

async function handleProjection(_req: Request): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  const profile = db.query("SELECT * FROM pay_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
  if (!profile) return json({ projection: [], message: "Set up your pay profile first" });

  // Get recent pay periods to calculate average
  const periods = db.query(
    "SELECT * FROM pay_periods WHERE user_id = ? ORDER BY end_date DESC LIMIT 5"
  ).all(userId) as Array<Record<string, unknown>>;

  const avgNetPay = periods.length > 0
    ? periods.reduce((sum, p) => sum + Number(p.net_pay), 0) / periods.length
    : Number(profile.hourly_rate) * 40 * 0.75; // fallback estimate

  // Get upcoming bills
  const bills = db.query(
    "SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC"
  ).all(userId) as Array<Record<string, unknown>>;

  // Simple 30-day projection (stub — real logic in future task)
  const projection = [];
  const today = new Date();
  let runningBalance = avgNetPay;

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];

    // Paycheck every 14 days (bi-weekly stub)
    if (i === 0 || i === 14 || i === 28) {
      runningBalance += avgNetPay;
    }

    // Bills due on this day
    const dueBills = bills.filter(b => String(b.due_date) === dateStr);
    let daySpend = 0;
    for (const b of dueBills) {
      daySpend += Number(b.amount);
    }
    runningBalance -= daySpend;

    projection.push({
      date: dateStr,
      income: (i === 0 || i === 14 || i === 28) ? avgNetPay : 0,
      expenses: daySpend,
      balance: Math.round(runningBalance * 100) / 100,
    });
  }

  return json({ projection });
}

// --- Resources ---

async function handleResources(_req: Request): Promise<Response> {
  const db = getDb();
  const rows = db.query("SELECT * FROM resources ORDER BY category, title").all();
  return json({ resources: rows });
}

// --- Tax estimation ---

function estimateTaxRate(region: string): number {
  // Stub tax rates — real logic in future task
  const rates: Record<string, number> = {
    "US": 0.22,
    "CA": 0.25,
    "UK": 0.20,
    "AU": 0.27,
    "": 0.22,
  };
  return rates[region] ?? 0.22;
}

// --- Router ---

export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Route matching
  if (path === "/api/profiles" || path === "/api/profiles/current") {
    return handleProfiles(req);
  }
  if (path === "/api/pay-periods") {
    return handlePayPeriods(req);
  }
  if (path === "/api/bills") {
    return handleBills(req);
  }
  if (path.startsWith("/api/bills/")) {
    const billId = path.split("/")[3];
    return handleBills(req, billId);
  }
  if (path === "/api/insurance-deductions") {
    return handleInsuranceDeductions(req);
  }
  if (path === "/api/projection") {
    return handleProjection(req);
  }
  if (path === "/api/resources") {
    return handleResources(req);
  }

  return error("Not found", 404);
}
