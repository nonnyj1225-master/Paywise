import { getDb } from "../db";
import { authenticateUser, handleAuthRequest } from "./auth";

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

// ── Auth helper: requires auth, returns userId ──
function requireAuth(req: Request): number | Response {
  const result = authenticateUser(req);
  if (typeof result !== "number") return result;
  return result;
}

// ── Helper: extract userId, forwarding the error response to caller ──
function getUserId(req: Request): { userId: number } | { errorResponse: Response } {
  const result = requireAuth(req);
  if (result instanceof Response) return { errorResponse: result };
  return { userId: result };
}

// =============================================================================
// State tax rate lookup (estimated effective federal + state combined rates)
// =============================================================================

const STATE_TAX_RATES: Record<string, number> = {
  'AL': 0.24, 'AK': 0.22, 'AZ': 0.24, 'AR': 0.25, 'CA': 0.28,
  'CO': 0.27, 'CT': 0.27, 'DE': 0.26, 'FL': 0.22, 'GA': 0.26,
  'HI': 0.28, 'ID': 0.26, 'IL': 0.27, 'IN': 0.25, 'IA': 0.25,
  'KS': 0.25, 'KY': 0.24, 'LA': 0.24, 'ME': 0.26, 'MD': 0.27,
  'MA': 0.27, 'MI': 0.25, 'MN': 0.27, 'MS': 0.24, 'MO': 0.25,
  'MT': 0.25, 'NE': 0.26, 'NV': 0.22, 'NH': 0.22, 'NJ': 0.27,
  'NM': 0.24, 'NY': 0.30, 'NC': 0.25, 'ND': 0.23, 'OH': 0.25,
  'OK': 0.24, 'OR': 0.30, 'PA': 0.26, 'RI': 0.25, 'SC': 0.25,
  'SD': 0.22, 'TN': 0.22, 'TX': 0.22, 'UT': 0.24, 'VT': 0.26,
  'VA': 0.26, 'WA': 0.22, 'WV': 0.25, 'WI': 0.26, 'WY': 0.22,
  'DC': 0.28,
};

function estimateTaxRate(region: string): number {
  const upper = region.toUpperCase().trim();
  if (STATE_TAX_RATES[upper] !== undefined) return STATE_TAX_RATES[upper];
  const legacy: Record<string, number> = { "US": 0.22, "UK": 0.20, "AU": 0.27, "": 0.22 };
  if (legacy[upper] !== undefined) return legacy[upper];
  return 0.22;
}

// =============================================================================
// Category severity ranking for bill prioritization
// =============================================================================

const CATEGORY_SEVERITY: Record<string, number> = {
  housing: 7,
  utilities: 6,
  food: 5,
  transportation: 4,
  insurance: 3,
  subscriptions: 2,
  other: 1,
};

// =============================================================================
// Pay period generation helpers
// =============================================================================

function getDaysPerPeriod(frequency: string): number {
  switch (frequency) {
    case 'weekly': return 7;
    case 'bi-weekly': return 14;
    case 'monthly': return 30;
    default: return 14;
  }
}

function getFrequencyIntervalDays(frequency: string): number {
  switch (frequency) {
    case 'weekly': return 7;
    case 'bi-weekly': return 14;
    case 'semi-monthly': return 15;
    case 'monthly': return 30;
    case 'quarterly': return 90;
    default: return 30;
  }
}

function generatePayPeriods(
  startDate: Date,
  frequency: string,
  count: number,
  hoursPerPeriod: number,
  hourlyRate: number,
  taxRate: number,
  deductions: Array<{ percentage: number; fixed_amount: number | null; per_pay_period: number }>
): Array<{
  startDate: string;
  endDate: string;
  grossPay: number;
  taxAmount: number;
  insuranceDeductions: number;
  netPay: number;
}> {
  const periods: Array<{
    startDate: string;
    endDate: string;
    grossPay: number;
    taxAmount: number;
    insuranceDeductions: number;
    netPay: number;
  }> = [];

  const daysPerPeriod = getDaysPerPeriod(frequency);
  let periodStart = new Date(startDate);

  for (let i = 0; i < count; i++) {
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + daysPerPeriod - 1);

    const grossPay = Math.round(hoursPerPeriod * hourlyRate * 100) / 100;
    const taxAmount = Math.round(grossPay * taxRate * 100) / 100;

    let insuranceTotal = 0;
    for (const d of deductions) {
      if (d.per_pay_period) {
        const pct = Number(d.percentage) || 0;
        const fixed = d.fixed_amount != null ? Number(d.fixed_amount) : 0;
        insuranceTotal += (grossPay * pct / 100) + fixed;
      }
    }
    insuranceTotal = Math.round(insuranceTotal * 100) / 100;
    const netPay = Math.round((grossPay - taxAmount - insuranceTotal) * 100) / 100;

    periods.push({
      startDate: periodStart.toISOString().split("T")[0],
      endDate: periodEnd.toISOString().split("T")[0],
      grossPay,
      taxAmount,
      insuranceDeductions: insuranceTotal,
      netPay,
    });

    periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() + 1);
  }

  return periods;
}

// =============================================================================
// Bill prioritization scoring
// =============================================================================

function scoreBill(
  bill: { due_date: string; priority: number; category: string; amount: number },
  today: Date
): number {
  const dueDate = new Date(bill.due_date + "T00:00:00");
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let dueScore = 50;
  if (daysUntilDue > 0) {
    dueScore = Math.max(0, 50 - daysUntilDue * 1.5);
  } else if (daysUntilDue < 0) {
    dueScore = 60 + Math.min(10, Math.abs(daysUntilDue));
  }

  const priorityScore = (bill.priority - 1) * 10;
  const severity = CATEGORY_SEVERITY[bill.category] || 1;
  const categoryScore = ((severity - 1) / 6) * 30;
  const amountScore = Math.max(0, 5 - (bill.amount / 200));

  return dueScore + priorityScore + categoryScore + amountScore;
}

// =============================================================================
// Profiles — scoped to authenticated user, multi-job support
// =============================================================================

async function handleProfiles(req: Request, profileId?: string): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  // GET /api/profiles/current — return the active profile
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.pathname === "/api/profiles/current") {
      const row = db.query(
        "SELECT * FROM pay_profiles WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1"
      ).get(userId) as Record<string, unknown> | null;
      return json(row ? { profile: row } : { profile: null });
    }

    // GET /api/profiles — return all profiles
    const rows = db.query(
      "SELECT * FROM pay_profiles WHERE user_id = ? ORDER BY started_at DESC"
    ).all(userId);
    return json({ profiles: rows });
  }

  // POST /api/profiles — create a new profile
  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const hourlyRate = Number(body.hourly_rate) || 0;
    const payFrequency = String(body.pay_frequency || "bi-weekly");
    const region = String(body.region || "");
    const customTaxRate = body.custom_tax_rate != null ? Number(body.custom_tax_rate) : null;
    const label = String(body.label || "My Job");
    const startedAt = String(body.started_at || new Date().toISOString().split("T")[0]);
    const endedAt = body.ended_at ? String(body.ended_at) : null;
    const isActive = body.is_active !== false ? 1 : 0;

    // If this new profile should be active, deactivate all others
    if (isActive) {
      db.run("UPDATE pay_profiles SET is_active = 0, updated_at = datetime('now') WHERE user_id = ?", [userId]);
    }

    db.run(
      `INSERT INTO pay_profiles (user_id, hourly_rate, pay_frequency, region, custom_tax_rate, label, is_active, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, hourlyRate, payFrequency, region, customTaxRate, label, isActive, startedAt, endedAt]
    );

    const row = db.query("SELECT * FROM pay_profiles WHERE id = last_insert_rowid()").get();
    return json({ profile: row }, 201);
  }

  // PUT /api/profiles/:id — update a specific profile
  if (req.method === "PUT" && profileId) {
    const existing = db.query("SELECT * FROM pay_profiles WHERE id = ? AND user_id = ?")
      .get(Number(profileId), userId);
    if (!existing) return error("Profile not found", 404);

    const body = (await parseBody(req)) as Record<string, unknown>;
    const ex = existing as Record<string, unknown>;
    const hourlyRate = body.hourly_rate != null ? Number(body.hourly_rate) : Number(ex.hourly_rate);
    const payFrequency = body.pay_frequency != null ? String(body.pay_frequency) : String(ex.pay_frequency);
    const region = body.region !== undefined ? String(body.region) : String(ex.region);
    const customTaxRate = body.custom_tax_rate !== undefined
      ? (body.custom_tax_rate != null ? Number(body.custom_tax_rate) : null)
      : (ex.custom_tax_rate != null ? Number(ex.custom_tax_rate) : null);
    const label = body.label != null ? String(body.label) : String(ex.label || "My Job");
    const startedAt = body.started_at != null ? String(body.started_at) : String(ex.started_at || "");
    const endedAt = body.ended_at !== undefined
      ? (body.ended_at != null ? String(body.ended_at) : null)
      : (ex.ended_at != null ? String(ex.ended_at) : null);
    const isActive = body.is_active != null ? (body.is_active ? 1 : 0) : Number(ex.is_active);

    if (isActive) {
      db.run("UPDATE pay_profiles SET is_active = 0, updated_at = datetime('now') WHERE user_id = ? AND id != ?", [userId, Number(profileId)]);
    }

    db.run(
      `UPDATE pay_profiles SET hourly_rate=?, pay_frequency=?, region=?, custom_tax_rate=?, label=?, is_active=?, started_at=?, ended_at=?, updated_at=datetime('now')
       WHERE id=? AND user_id=?`,
      [hourlyRate, payFrequency, region, customTaxRate, label, isActive, startedAt, endedAt, Number(profileId), userId]
    );

    const row = db.query("SELECT * FROM pay_profiles WHERE id = ?").get(Number(profileId));
    return json({ profile: row });
  }

  // DELETE /api/profiles/:id — delete a profile (but not the last one)
  if (req.method === "DELETE" && profileId) {
    const existing = db.query("SELECT * FROM pay_profiles WHERE id = ? AND user_id = ?")
      .get(Number(profileId), userId);
    if (!existing) return error("Profile not found", 404);

    const count = db.query("SELECT COUNT(*) as c FROM pay_profiles WHERE user_id = ?")
      .get(userId) as { c: number };
    if (count.c <= 1) return error("Cannot delete your only pay profile", 400);

    const wasActive = (existing as Record<string, unknown>).is_active;
    db.run("DELETE FROM pay_profiles WHERE id = ? AND user_id = ?", [Number(profileId), userId]);

    // If we deleted the active profile, activate the most recent remaining one
    if (wasActive) {
      db.run(
        "UPDATE pay_profiles SET is_active = 1, updated_at = datetime('now') WHERE user_id = ? AND id = (SELECT id FROM pay_profiles WHERE user_id = ? ORDER BY started_at DESC LIMIT 1)",
        [userId, userId]
      );
    }

    return json({ deleted: true });
  }

  return error("Method not allowed", 405);
}

// POST /api/profiles/:id/activate — activate a specific profile
async function handleActivateProfile(req: Request, profileId: string): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  if (req.method !== "POST") return error("Method not allowed", 405);

  const existing = db.query("SELECT * FROM pay_profiles WHERE id = ? AND user_id = ?")
    .get(Number(profileId), userId);
  if (!existing) return error("Profile not found", 404);

  // Deactivate all profiles, then activate this one
  db.run("UPDATE pay_profiles SET is_active = 0, updated_at = datetime('now') WHERE user_id = ?", [userId]);
  db.run("UPDATE pay_profiles SET is_active = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?", [Number(profileId), userId]);

  const row = db.query("SELECT * FROM pay_profiles WHERE id = ?").get(Number(profileId));
  return json({ profile: row });
}

// =============================================================================
// Compare Jobs — profit/loss comparison between two profiles
// =============================================================================

async function handleCompareJobs(req: Request): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  if (req.method !== "GET") return error("Method not allowed", 405);

  const url = new URL(req.url);
  const profileAId = url.searchParams.get("profile_a");
  const profileBId = url.searchParams.get("profile_b");

  if (!profileAId || !profileBId) return error("Both profile_a and profile_b query params are required", 400);
  if (profileAId === profileBId) return error("Select two different profiles to compare", 400);

  // Fetch both profiles
  const profileA = db.query("SELECT * FROM pay_profiles WHERE id = ? AND user_id = ?")
    .get(Number(profileAId), userId) as Record<string, unknown> | null;
  const profileB = db.query("SELECT * FROM pay_profiles WHERE id = ? AND user_id = ?")
    .get(Number(profileBId), userId) as Record<string, unknown> | null;

  if (!profileA) return error("Profile A not found", 404);
  if (!profileB) return error("Profile B not found", 404);

  // Fetch pay periods for both profiles
  const periodsA = db.query(
    "SELECT * FROM pay_periods WHERE user_id = ? AND pay_profile_id = ? ORDER BY end_date ASC"
  ).all(userId, Number(profileAId)) as Array<Record<string, unknown>>;

  const periodsB = db.query(
    "SELECT * FROM pay_periods WHERE user_id = ? AND pay_profile_id = ? ORDER BY end_date ASC"
  ).all(userId, Number(profileBId)) as Array<Record<string, unknown>>;

  // Calculate averages
  function avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function calcTaxRate(period: Record<string, unknown>): number {
    const gross = Number(period.gross_pay) || 0;
    const tax = Number(period.tax_amount) || 0;
    return gross > 0 ? (tax / gross) * 100 : 0;
  }

  function calcNetAfterBills(netPay: number, userId: number): number {
    const allBills = db.query(
      "SELECT SUM(amount) as total FROM bills WHERE user_id = ?"
    ).get(userId) as { total: number | null };
    const monthlyBills = (allBills.total || 0);
    // Approximate per-period bill load based on the profile's pay frequency
    return netPay - (monthlyBills / 2); // rough bi-weekly approximation
  }

  const netPaysA = periodsA.map(p => Number(p.net_pay) || 0);
  const netPaysB = periodsB.map(p => Number(p.net_pay) || 0);
  const insuranceA = periodsA.map(p => Number(p.insurance_deductions) || 0);
  const insuranceB = periodsB.map(p => Number(p.insurance_deductions) || 0);
  const taxRatesA = periodsA.map(p => calcTaxRate(p));
  const taxRatesB = periodsB.map(p => calcTaxRate(p));

  const avgNetPayA = avg(netPaysA);
  const avgNetPayB = avg(netPaysB);
  const avgTaxRateA = avg(taxRatesA);
  const avgTaxRateB = avg(taxRatesB);
  const avgInsuranceA = avg(insuranceA);
  const avgInsuranceB = avg(insuranceB);

  const hourlyRateA = Number(profileA.hourly_rate) || 0;
  const hourlyRateB = Number(profileB.hourly_rate) || 0;

  const netAfterBillsA = calcNetAfterBills(avgNetPayA, userId);
  const netAfterBillsB = calcNetAfterBills(avgNetPayB, userId);

  function pctChange(oldVal: number, newVal: number): number {
    if (oldVal === 0) return newVal > 0 ? 100 : 0;
    return ((newVal - oldVal) / Math.abs(oldVal)) * 100;
  }

  return json({
    profileA: {
      id: profileA.id,
      label: profileA.label || "Job A",
      hourly_rate: hourlyRateA,
      region: profileA.region || "",
    },
    profileB: {
      id: profileB.id,
      label: profileB.label || "Job B",
      hourly_rate: hourlyRateB,
      region: profileB.region || "",
    },
    comparison: {
      hourlyRateChange: {
        absolute: Math.round((hourlyRateB - hourlyRateA) * 100) / 100,
        percentage: Math.round(pctChange(hourlyRateA, hourlyRateB) * 10) / 10,
      },
      averageNetPayA: Math.round(avgNetPayA * 100) / 100,
      averageNetPayB: Math.round(avgNetPayB * 100) / 100,
      netPayChange: {
        absolute: Math.round((avgNetPayB - avgNetPayA) * 100) / 100,
        percentage: Math.round(pctChange(avgNetPayA, avgNetPayB) * 10) / 10,
      },
      averageTaxRateA: Math.round(avgTaxRateA * 10) / 10,
      averageTaxRateB: Math.round(avgTaxRateB * 10) / 10,
      insuranceChange: {
        absolute: Math.round((avgInsuranceB - avgInsuranceA) * 100) / 100,
        percentage: Math.round(pctChange(avgInsuranceA, avgInsuranceB) * 10) / 10,
      },
      netAfterBillsA: Math.round(netAfterBillsA * 100) / 100,
      netAfterBillsB: Math.round(netAfterBillsB * 100) / 100,
      netAfterBillsChange: {
        absolute: Math.round((netAfterBillsB - netAfterBillsA) * 100) / 100,
        percentage: Math.round(pctChange(netAfterBillsA, netAfterBillsB) * 10) / 10,
      },
    },
    payPeriodsA: periodsA,
    payPeriodsB: periodsB,
  });
}

// =============================================================================
// Pay Periods — scoped to authenticated user, unlimited history
// =============================================================================

async function handlePayPeriods(req: Request): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  if (req.method === "GET") {
    // Unlimited history (no LIMIT)
    const rows = db.query("SELECT * FROM pay_periods WHERE user_id = ? ORDER BY end_date DESC").all(userId);
    return json({ pay_periods: rows });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;

    const profile = db.query("SELECT * FROM pay_profiles WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
    if (!profile) return error("No pay profile found. Create a profile first.", 400);

    const hoursWorked = Number(body.hours_worked) || 0;
    const hourlyRate = Number(profile.hourly_rate) || 0;
    const grossPay = Math.round(hoursWorked * hourlyRate * 100) / 100;

    let taxRate = 0;
    if (profile.custom_tax_rate != null) {
      taxRate = Number(profile.custom_tax_rate);
    } else {
      taxRate = estimateTaxRate(String(profile.region || ""));
    }

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

// ── Single Pay Period (edit/delete) ──
async function handlePayPeriod(req: Request, periodId: string): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  // GET /api/pay-periods/:id — fetch single period
  if (req.method === "GET") {
    const row = db.query("SELECT * FROM pay_periods WHERE id = ? AND user_id = ?")
      .get(Number(periodId), userId);
    if (!row) return error("Pay period not found", 404);
    return json({ pay_period: row });
  }

  // PUT /api/pay-periods/:id — update hours_worked, start_date, end_date
  if (req.method === "PUT") {
    const existing = db.query("SELECT * FROM pay_periods WHERE id = ? AND user_id = ?")
      .get(Number(periodId), userId) as Record<string, unknown> | null;
    if (!existing) return error("Pay period not found", 404);

    const body = (await parseBody(req)) as Record<string, unknown>;
    const hoursWorked = body.hours_worked != null ? Number(body.hours_worked) : Number(existing.hours_worked);
    const startDate = body.start_date != null ? String(body.start_date) : String(existing.start_date);
    const endDate = body.end_date != null ? String(body.end_date) : String(existing.end_date);

    // Recalculate gross/tax/net/insurance
    const payProfileId = Number(existing.pay_profile_id);
    const profile = db.query("SELECT * FROM pay_profiles WHERE id = ? AND user_id = ?")
      .get(payProfileId, userId) as Record<string, unknown> | null;
    if (!profile) return error("Associated pay profile not found", 400);

    const hourlyRate = Number(profile.hourly_rate) || 0;
    const grossPay = Math.round(hoursWorked * hourlyRate * 100) / 100;

    let taxRate = 0;
    if (profile.custom_tax_rate != null) {
      taxRate = Number(profile.custom_tax_rate);
    } else {
      taxRate = estimateTaxRate(String(profile.region || ""));
    }

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

    db.run(
      `UPDATE pay_periods SET hours_worked=?, gross_pay=?, tax_amount=?, net_pay=?, insurance_deductions=?, start_date=?, end_date=?
       WHERE id=? AND user_id=?`,
      [hoursWorked, grossPay, taxAmount, netPay, insuranceTotal, startDate, endDate, Number(periodId), userId]
    );

    const row = db.query("SELECT * FROM pay_periods WHERE id = ?").get(Number(periodId));
    return json({ pay_period: row });
  }

  // DELETE /api/pay-periods/:id
  if (req.method === "DELETE") {
    const existing = db.query("SELECT * FROM pay_periods WHERE id = ? AND user_id = ?")
      .get(Number(periodId), userId);
    if (!existing) return error("Pay period not found", 404);

    db.run("DELETE FROM pay_periods WHERE id = ? AND user_id = ?", [Number(periodId), userId]);
    return json({ deleted: true });
  }

  return error("Method not allowed", 405);
}

// =============================================================================
// Bills — scoped to authenticated user
// =============================================================================

async function handleBills(req: Request, billId?: string): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  if (req.method === "GET") {
    const url = new URL(req.url);
    const includeDeleted = url.searchParams.get("include_deleted") === "true";
    const rows = includeDeleted
      ? db.query("SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC").all(userId)
      : db.query("SELECT * FROM bills WHERE user_id = ? AND deleted_at IS NULL ORDER BY due_date ASC").all(userId);
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
    const frequency = String(body.frequency || "monthly");

    if (!name || !dueDate) return error("Name and due_date are required", 400);

    db.run(
      `INSERT INTO bills (user_id, name, amount, due_date, category, priority, recurring, frequency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, amount, dueDate, category, priority, recurring, frequency]
    );

    const row = db.query("SELECT * FROM bills WHERE id = last_insert_rowid()").get();
    return json({ bill: row }, 201);
  }

  if (req.method === "PUT" && billId) {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const existing = db.query("SELECT * FROM bills WHERE id = ? AND user_id = ?").get(Number(billId), userId);
    if (!existing) return error("Bill not found", 404);

    const ex = existing as Record<string, unknown>;
    const name = String(body.name ?? ex.name);
    const amount = Number(body.amount ?? ex.amount);
    const dueDate = String(body.due_date ?? ex.due_date);
    const category = String(body.category ?? ex.category);
    const priority = Number(body.priority ?? ex.priority);
    const recurring = body.recurring != null ? (body.recurring ? 1 : 0) : ex.recurring;
    const frequency = body.frequency != null ? String(body.frequency) : String(ex.frequency || "monthly");
    // Support undo: setting deleted_at to null
    const deletedAt = body.deleted_at !== undefined ? (body.deleted_at === null ? null : String(body.deleted_at)) : ex.deleted_at;

    db.run(
      `UPDATE bills SET name=?, amount=?, due_date=?, category=?, priority=?, recurring=?, frequency=?, deleted_at=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
      [name, amount, dueDate, category, priority, recurring, frequency, deletedAt, Number(billId), userId]
    );

    const row = db.query("SELECT * FROM bills WHERE id = ?").get(Number(billId));
    return json({ bill: row });
  }

  if (req.method === "DELETE" && billId) {
    const existing = db.query("SELECT * FROM bills WHERE id = ? AND user_id = ? AND deleted_at IS NULL").get(Number(billId), userId);
    if (!existing) return error("Bill not found", 404);

    // Soft delete: set deleted_at instead of removing
    db.run("UPDATE bills SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?", [Number(billId), userId]);
    return json({ deleted: true, bill_id: Number(billId) });
  }

  return error("Method not allowed", 405);
}

// =============================================================================
// Insurance Deductions — scoped to authenticated user
// =============================================================================

async function handleInsuranceDeductions(req: Request, deductionId?: string): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  if (req.method === "GET") {
    const rows = db.query("SELECT * FROM insurance_deductions WHERE user_id = ?").all(userId);
    return json({ insurance_deductions: rows });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const name = String(body.name || "");
    const perPayPeriod = body.per_pay_period !== false ? 1 : 0;

    if (!name) return error("Name is required", 400);

    let percentage = Number(body.percentage) || 0;
    let fixedAmount: number | null = body.fixed_amount != null ? Number(body.fixed_amount) : null;

    if (body.actual_deducted != null && body.reference_gross != null) {
      const actualDeducted = Number(body.actual_deducted);
      const referenceGross = Number(body.reference_gross);
      if (referenceGross > 0 && actualDeducted > 0) {
        percentage = Math.round((actualDeducted / referenceGross) * 10000) / 100;
      }
    }

    db.run(
      `INSERT INTO insurance_deductions (user_id, name, percentage, fixed_amount, per_pay_period) VALUES (?, ?, ?, ?, ?)`,
      [userId, name, percentage, fixedAmount, perPayPeriod]
    );

    const row = db.query("SELECT * FROM insurance_deductions WHERE id = last_insert_rowid()").get();
    return json({ insurance_deduction: row }, 201);
  }

  if (req.method === "PUT" && deductionId) {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const existing = db.query("SELECT * FROM insurance_deductions WHERE id = ? AND user_id = ?").get(Number(deductionId), userId);
    if (!existing) return error("Deduction not found", 404);

    const name = String(body.name ?? (existing as Record<string, unknown>).name);
    let percentage = body.percentage != null ? Number(body.percentage) : Number((existing as Record<string, unknown>).percentage);
    const fixedAmount = body.fixed_amount !== undefined ? (body.fixed_amount != null ? Number(body.fixed_amount) : null) : (existing as Record<string, unknown>).fixed_amount;
    const perPayPeriod = body.per_pay_period != null ? (body.per_pay_period ? 1 : 0) : Number((existing as Record<string, unknown>).per_pay_period);

    if (body.actual_deducted != null && body.reference_gross != null) {
      const actualDeducted = Number(body.actual_deducted);
      const referenceGross = Number(body.reference_gross);
      if (referenceGross > 0 && actualDeducted > 0) {
        percentage = Math.round((actualDeducted / referenceGross) * 10000) / 100;
      }
    }

    db.run(
      `UPDATE insurance_deductions SET name=?, percentage=?, fixed_amount=?, per_pay_period=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
      [name, percentage, fixedAmount, perPayPeriod, Number(deductionId), userId]
    );

    const row = db.query("SELECT * FROM insurance_deductions WHERE id = ?").get(Number(deductionId));
    return json({ insurance_deduction: row });
  }

  if (req.method === "DELETE" && deductionId) {
    const existing = db.query("SELECT * FROM insurance_deductions WHERE id = ? AND user_id = ?").get(Number(deductionId), userId);
    if (!existing) return error("Deduction not found", 404);

    db.run("DELETE FROM insurance_deductions WHERE id = ? AND user_id = ?", [Number(deductionId), userId]);
    return json({ deleted: true });
  }

  return error("Method not allowed", 405);
}

// =============================================================================
// Projection — "Best Course of Action" Engine — scoped to authenticated user
// =============================================================================

async function handleProjection(_req: Request): Promise<Response> {
  const db = getDb();
  const uid = getUserId(_req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  const profile = db.query("SELECT * FROM pay_profiles WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
  if (!profile) return json({ payPeriods: [], summary: { totalBills: 0, coveredBills: 0, uncoveredBills: 0, pastDueAlerts: [], projectedSavings: 0 }, message: "Set up your pay profile first" });

  const hourlyRate = Number(profile.hourly_rate) || 0;
  const payFrequency = String(profile.pay_frequency || "bi-weekly");
  const region = String(profile.region || "");

  let taxRate: number;
  if (profile.custom_tax_rate != null) {
    taxRate = Number(profile.custom_tax_rate);
  } else {
    taxRate = estimateTaxRate(region);
  }

  const deductions = db.query("SELECT * FROM insurance_deductions WHERE user_id = ?").all(userId) as Array<{
    id: number; name: string; percentage: number; fixed_amount: number | null; per_pay_period: number;
  }>;

  const recentPeriods = db.query(
    "SELECT * FROM pay_periods WHERE user_id = ? ORDER BY end_date DESC LIMIT 5"
  ).all(userId) as Array<Record<string, unknown>>;

  let avgHours: number;
  if (recentPeriods.length > 0) {
    avgHours = recentPeriods.reduce((sum, p) => sum + Number(p.hours_worked), 0) / recentPeriods.length;
  } else {
    switch (payFrequency) {
      case 'weekly': avgHours = 40; break;
      case 'bi-weekly': avgHours = 80; break;
      case 'monthly': avgHours = 160; break;
      default: avgHours = 80;
    }
  }

  const daysPerPeriod = getDaysPerPeriod(payFrequency);
  const projectionDays = 30;
  const periodCount = Math.ceil(projectionDays / daysPerPeriod) + 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payPeriods = generatePayPeriods(
    today,
    payFrequency,
    periodCount,
    avgHours,
    hourlyRate,
    taxRate,
    deductions
  );

  const allBills = db.query("SELECT * FROM bills WHERE user_id = ? AND deleted_at IS NULL ORDER BY due_date ASC").all(userId) as Array<{
    id: number; name: string; amount: number; due_date: string; category: string; priority: number; recurring: number; frequency: string;
  }>;

  // Expand recurring bills into occurrences within the projection window
  interface BillOccurrence {
    id: number;
    originalId: number;
    name: string;
    amount: number;
    due_date: string;
    category: string;
    priority: number;
    isOccurrence: boolean; // true if this is a generated occurrence
    occurrenceIndex: number;
  }

  const billOccurrences: BillOccurrence[] = [];
  const projectionEnd = new Date(today);
  projectionEnd.setDate(projectionEnd.getDate() + projectionDays + 7); // buffer

  for (const bill of allBills) {
    if (bill.recurring && bill.frequency && bill.frequency !== 'monthly') {
      // Generate occurrences based on frequency
      const intervalDays = getFrequencyIntervalDays(bill.frequency);
      const baseDueDate = new Date(bill.due_date + "T00:00:00");
      let occurrenceDate = new Date(baseDueDate);
      let occIndex = 0;

      while (occurrenceDate <= projectionEnd) {
        // Only include occurrences that are >= today or within a reasonable past window
        if (occurrenceDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
          billOccurrences.push({
            id: -(bill.id * 1000 + occIndex), // negative compound IDs for occurrences
            originalId: bill.id,
            name: bill.name + (occIndex > 0 ? ` (#${occIndex + 1})` : ''),
            amount: bill.amount,
            due_date: occurrenceDate.toISOString().split("T")[0],
            category: bill.category,
            priority: bill.priority,
            isOccurrence: true,
            occurrenceIndex: occIndex,
          });
        }
        // Advance by frequency interval
        occurrenceDate = new Date(occurrenceDate);
        occurrenceDate.setDate(occurrenceDate.getDate() + intervalDays);
        occIndex++;
      }
    } else {
      // Non-recurring or monthly: treat as single occurrence
      billOccurrences.push({
        id: bill.id,
        originalId: bill.id,
        name: bill.name,
        amount: bill.amount,
        due_date: bill.due_date,
        category: bill.category,
        priority: bill.priority,
        isOccurrence: false,
        occurrenceIndex: 0,
      });
    }
  }

  const scoredBills = billOccurrences.map(bill => ({
    ...bill,
    score: scoreBill(bill, today),
  }));
  scoredBills.sort((a, b) => b.score - a.score);

  interface BillAllocation {
    billId: number;
    billName: string;
    billAmount: number;
    dueDate: string;
    category: string;
    priority: number;
    allocated: number;
    payPeriodIndex: number;
    status: 'paid' | 'partial' | 'unpaid';
  }

  const billAllocations: Map<number, BillAllocation> = new Map();
  const pastDueAlerts: Array<{ id: number; name: string; dueDate: string; amount: number }> = [];

  for (const bill of scoredBills) {
    const billDueDate = new Date(bill.due_date + "T00:00:00");
    let remaining = bill.amount;
    let allocated = 0;
    let allocatedPeriodIndex = -1;

    for (let pi = 0; pi < payPeriods.length; pi++) {
      const periodStart = new Date(payPeriods[pi].startDate + "T00:00:00");
      if (periodStart > billDueDate) break;

      let periodUsed = 0;
      billAllocations.forEach(alloc => {
        if (alloc.payPeriodIndex === pi) periodUsed += alloc.allocated;
      });

      const available = payPeriods[pi].netPay - periodUsed;
      if (available <= 0) continue;

      const toAllocate = Math.min(remaining, Math.max(0, available));
      if (toAllocate > 0) {
        allocated += toAllocate;
        remaining -= toAllocate;
        allocatedPeriodIndex = pi;
        allocated = Math.round(allocated * 100) / 100;
        remaining = Math.round(remaining * 100) / 100;
      }

      if (remaining <= 0.005) break;
    }

    let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
    if (allocated >= bill.amount - 0.005) {
      status = 'paid';
    } else if (allocated > 0) {
      status = 'partial';
    }

    billAllocations.set(bill.id, {
      billId: bill.id,
      billName: bill.name,
      billAmount: bill.amount,
      dueDate: bill.due_date,
      category: bill.category,
      priority: bill.priority,
      allocated,
      payPeriodIndex: allocatedPeriodIndex,
      status,
    });

    if (billDueDate < today && status !== 'paid') {
      pastDueAlerts.push({
        id: bill.id,
        name: bill.name,
        dueDate: bill.due_date,
        amount: bill.amount,
      });
    }
  }

  const payPeriodResults = payPeriods.map((pp, pi) => {
    const ppBills: Array<{
      id: number; name: string; amount: number; dueDate: string;
      category: string; priority: number; status: string;
    }> = [];

    let periodBillTotal = 0;
    billAllocations.forEach(alloc => {
      if (alloc.payPeriodIndex === pi) {
        ppBills.push({
          id: alloc.billId,
          name: alloc.billName,
          amount: alloc.billAmount,
          dueDate: alloc.dueDate,
          category: alloc.category,
          priority: alloc.priority,
          status: alloc.status,
        });
        periodBillTotal += alloc.allocated;
      }
    });

    const remaining = Math.round((pp.netPay - periodBillTotal) * 100) / 100;
    const remainingPositive = Math.max(0, remaining);
    const suggestedSavings = Math.round(remainingPositive * 0.7 * 100) / 100;
    const safeToSpend = Math.round((remainingPositive - suggestedSavings) * 100) / 100;

    return {
      startDate: pp.startDate,
      endDate: pp.endDate,
      grossPay: pp.grossPay,
      taxAmount: pp.taxAmount,
      insuranceDeductions: pp.insuranceDeductions,
      netPay: pp.netPay,
      bills: ppBills,
      remaining,
      safeToSpend,
      suggestedSavings,
    };
  });

  const totalBills = Math.round(allBills.reduce((s, b) => s + b.amount, 0) * 100) / 100;
  let coveredBills = 0;
  let uncoveredBills = 0;
  let projectedSavings = 0;

  billAllocations.forEach(alloc => {
    if (alloc.status === 'paid') coveredBills++;
    else uncoveredBills++;
  });

  payPeriodResults.forEach(pp => {
    projectedSavings += pp.suggestedSavings;
  });
  projectedSavings = Math.round(projectedSavings * 100) / 100;

  return json({
    payPeriods: payPeriodResults,
    summary: {
      totalBills,
      coveredBills,
      uncoveredBills,
      pastDueAlerts,
      projectedSavings,
    },
  });
}

// =============================================================================
// Resources — PUBLIC, no auth required
// =============================================================================

async function handleResources(_req: Request): Promise<Response> {
  const db = getDb();
  const rows = db.query("SELECT * FROM resources ORDER BY category, title").all();
  return json({ resources: rows });
}

// =============================================================================
// Savings Goals — scoped to authenticated user
// =============================================================================

async function handleGoals(req: Request, goalId?: string): Promise<Response> {
  const db = getDb();
  const uid = getUserId(req);
  if ("errorResponse" in uid) return uid.errorResponse;
  const userId = uid.userId;

  // GET /api/goals — list all goals
  if (req.method === "GET") {
    const rows = db.query(
      "SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC"
    ).all(userId);
    return json({ goals: rows });
  }

  // Routes with :id — check these first
  if (goalId) {
    // POST /api/goals/:id/contribute — add funds to a goal
    if (req.method === "POST" && req.url.endsWith("/contribute")) {
      const existing = db.query("SELECT * FROM savings_goals WHERE id = ? AND user_id = ?")
        .get(Number(goalId), userId) as Record<string, unknown> | null;
      if (!existing) return error("Goal not found", 404);

      const body = (await parseBody(req)) as Record<string, unknown>;
      const amount = Number(body.amount) || 0;
      if (amount <= 0) return error("Amount must be greater than 0", 400);

      const current = Number(existing.current_amount);
      const target = Number(existing.target_amount);
      const newAmount = Math.min(current + amount, target);

      db.run(
        "UPDATE savings_goals SET current_amount = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        [newAmount, Number(goalId), userId]
      );

      const row = db.query("SELECT * FROM savings_goals WHERE id = ?").get(Number(goalId));
      return json({ goal: row });
    }

    // PUT /api/goals/:id — update a goal
    if (req.method === "PUT") {
      const existing = db.query("SELECT * FROM savings_goals WHERE id = ? AND user_id = ?")
        .get(Number(goalId), userId) as Record<string, unknown> | null;
      if (!existing) return error("Goal not found", 404);

      const body = (await parseBody(req)) as Record<string, unknown>;
      const ex = existing;
      const name = body.name !== undefined ? String(body.name).trim() : String(ex.name);
      const targetAmount = body.target_amount !== undefined ? Number(body.target_amount) : Number(ex.target_amount);
      const currentAmount = body.current_amount !== undefined ? Number(body.current_amount) : Number(ex.current_amount);
      const category = body.category !== undefined ? String(body.category) : String(ex.category);
      const targetDate = body.target_date !== undefined ? (body.target_date ? String(body.target_date) : null) : (ex.target_date != null ? String(ex.target_date) : null);
      const icon = body.icon !== undefined ? String(body.icon) : String(ex.icon || "🎯");

      if (!name) return error("Name is required", 400);
      if (targetAmount <= 0) return error("Target amount must be greater than 0", 400);

      db.run(
        `UPDATE savings_goals SET name=?, target_amount=?, current_amount=?, category=?, target_date=?, icon=?, updated_at=datetime('now')
         WHERE id=? AND user_id=?`,
        [name, targetAmount, currentAmount, category, targetDate, icon, Number(goalId), userId]
      );

      const row = db.query("SELECT * FROM savings_goals WHERE id = ?").get(Number(goalId));
      return json({ goal: row });
    }

    // DELETE /api/goals/:id — delete a goal
    if (req.method === "DELETE") {
      const existing = db.query("SELECT * FROM savings_goals WHERE id = ? AND user_id = ?")
        .get(Number(goalId), userId);
      if (!existing) return error("Goal not found", 404);

      db.run("DELETE FROM savings_goals WHERE id = ? AND user_id = ?", [Number(goalId), userId]);
      return json({ deleted: true });
    }
  }

  // POST /api/goals — create a new goal (no :id)
  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const targetAmount = Number(body.target_amount) || 0;
    const currentAmount = Number(body.current_amount) || 0;
    const category = String(body.category || "other");
    const targetDate = body.target_date ? String(body.target_date) : null;
    const icon = String(body.icon || "🎯");

    if (!name) return error("Name is required", 400);
    if (targetAmount <= 0) return error("Target amount must be greater than 0", 400);

    db.run(
      `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, category, target_date, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, targetAmount, currentAmount, category, targetDate, icon]
    );

    const row = db.query("SELECT * FROM savings_goals WHERE id = last_insert_rowid()").get();
    return json({ goal: row }, 201);
  }

  return error("Method not allowed", 405);
}

// =============================================================================
// Router
// =============================================================================

export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // ── Auth routes ──
  if (path.startsWith("/api/auth/")) {
    return handleAuthRequest(req);
  }

  // ── Public routes (no auth required) ──
  if (path === "/api/resources") {
    return handleResources(req);
  }

  // ── Protected routes ──
  if (path === "/api/compare-jobs") {
    return handleCompareJobs(req);
  }
  if (path.startsWith("/api/profiles/current")) {
    return handleProfiles(req);
  }
  if (path.startsWith("/api/profiles/") && path.endsWith("/activate")) {
    const profileId = path.split("/")[3];
    return handleActivateProfile(req, profileId);
  }
  if (path.startsWith("/api/profiles/")) {
    const profileId = path.split("/")[3];
    return handleProfiles(req, profileId);
  }
  if (path === "/api/profiles") {
    return handleProfiles(req);
  }
  if (path === "/api/pay-periods") {
    return handlePayPeriods(req);
  }
  if (path.startsWith("/api/pay-periods/")) {
    const periodId = path.split("/")[3];
    return handlePayPeriod(req, periodId);
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
  if (path.startsWith("/api/insurance-deductions/")) {
    const deductionId = path.split("/")[3];
    return handleInsuranceDeductions(req, deductionId);
  }
  if (path === "/api/projection") {
    return handleProjection(req);
  }
  if (path.startsWith("/api/goals/") && path.endsWith("/contribute")) {
    const goalId = path.split("/")[3];
    return handleGoals(req, goalId);
  }
  if (path.startsWith("/api/goals/")) {
    const goalId = path.split("/")[3];
    return handleGoals(req, goalId);
  }
  if (path === "/api/goals") {
    return handleGoals(req);
  }

  return error("Not found", 404);
}
