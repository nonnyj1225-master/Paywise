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
  // Fallback: check for legacy country codes
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
  // Higher score = higher priority
  const dueDate = new Date(bill.due_date + "T00:00:00");
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Due date proximity: closer = higher score (max 50 points, decaying)
  let dueScore = 50;
  if (daysUntilDue > 0) {
    dueScore = Math.max(0, 50 - daysUntilDue * 1.5);
  } else if (daysUntilDue < 0) {
    // Past due gets highest urgency
    dueScore = 60 + Math.min(10, Math.abs(daysUntilDue));
  }

  // Priority level: 1-5, maps to 0-40 points
  const priorityScore = (bill.priority - 1) * 10;

  // Category severity: maps to 0-30 points
  const severity = CATEGORY_SEVERITY[bill.category] || 1;
  const categoryScore = ((severity - 1) / 6) * 30;

  // Tiebreaker: smaller amounts first (0-5 points, inverted)
  const amountScore = Math.max(0, 5 - (bill.amount / 200));

  return dueScore + priorityScore + categoryScore + amountScore;
}

// =============================================================================
// Profiles
// =============================================================================

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

// =============================================================================
// Pay Periods
// =============================================================================

async function handlePayPeriods(req: Request): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  if (req.method === "GET") {
    const rows = db.query("SELECT * FROM pay_periods WHERE user_id = ? ORDER BY end_date DESC LIMIT 20").all(userId);
    return json({ pay_periods: rows });
  }

  if (req.method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;

    const profile = db.query("SELECT * FROM pay_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
    if (!profile) return error("No pay profile found. Create a profile first.", 400);

    const hoursWorked = Number(body.hours_worked) || 0;
    const hourlyRate = Number(profile.hourly_rate) || 0;
    const grossPay = Math.round(hoursWorked * hourlyRate * 100) / 100;

    // Calculate tax using state lookup
    let taxRate = 0;
    if (profile.custom_tax_rate != null) {
      taxRate = Number(profile.custom_tax_rate);
    } else {
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

// =============================================================================
// Bills
// =============================================================================

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

// =============================================================================
// Insurance Deductions
// =============================================================================

async function handleInsuranceDeductions(req: Request, deductionId?: string): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

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

    // "Learn from my last check" flow:
    // If actual_deducted and reference_gross are provided, calculate the percentage
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

    // "Learn from my last check" flow on update too
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
// Projection — "Best Course of Action" Engine
// =============================================================================

async function handleProjection(_req: Request): Promise<Response> {
  const db = getDb();
  const userId = ensureUser();

  const profile = db.query("SELECT * FROM pay_profiles WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as Record<string, unknown> | null;
  if (!profile) return json({ payPeriods: [], summary: { totalBills: 0, coveredBills: 0, uncoveredBills: 0, pastDueAlerts: [], projectedSavings: 0 }, message: "Set up your pay profile first" });

  const hourlyRate = Number(profile.hourly_rate) || 0;
  const payFrequency = String(profile.pay_frequency || "bi-weekly");
  const region = String(profile.region || "");

  // Determine tax rate
  let taxRate: number;
  if (profile.custom_tax_rate != null) {
    taxRate = Number(profile.custom_tax_rate);
  } else {
    taxRate = estimateTaxRate(region);
  }

  // Get insurance deductions
  const deductions = db.query("SELECT * FROM insurance_deductions WHERE user_id = ?").all(userId) as Array<{
    id: number; name: string; percentage: number; fixed_amount: number | null; per_pay_period: number;
  }>;

  // Get average hours from recent pay periods, or use a default (40 for weekly/bi-weekly, 160 for monthly)
  const recentPeriods = db.query(
    "SELECT * FROM pay_periods WHERE user_id = ? ORDER BY end_date DESC LIMIT 5"
  ).all(userId) as Array<Record<string, unknown>>;

  let avgHours: number;
  if (recentPeriods.length > 0) {
    avgHours = recentPeriods.reduce((sum, p) => sum + Number(p.hours_worked), 0) / recentPeriods.length;
  } else {
    // Sensible defaults based on frequency
    switch (payFrequency) {
      case 'weekly': avgHours = 40; break;
      case 'bi-weekly': avgHours = 80; break;
      case 'monthly': avgHours = 160; break;
      default: avgHours = 80;
    }
  }

  // Determine how many pay periods to project
  const daysPerPeriod = getDaysPerPeriod(payFrequency);
  const projectionDays = 30; // 30-day window; Pro tier could be 180
  const periodCount = Math.ceil(projectionDays / daysPerPeriod) + 1;

  // Start projection from today
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

  // Get all bills
  const allBills = db.query("SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC").all(userId) as Array<{
    id: number; name: string; amount: number; due_date: string; category: string; priority: number; recurring: number;
  }>;

  // Score and sort bills by priority
  const scoredBills = allBills.map(bill => ({
    ...bill,
    score: scoreBill(bill, today),
  }));
  scoredBills.sort((a, b) => b.score - a.score);

  // Track allocations across pay periods
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

  // For each bill, try to allocate from the earliest pay period whose start date
  // is on or before the bill's due date
  for (const bill of scoredBills) {
    const billDueDate = new Date(bill.due_date + "T00:00:00");
    let remaining = bill.amount;
    let allocated = 0;
    let allocatedPeriodIndex = -1;

    // Find the first pay period that can cover this bill (start date <= due date)
    for (let pi = 0; pi < payPeriods.length; pi++) {
      const periodStart = new Date(payPeriods[pi].startDate + "T00:00:00");

      if (periodStart > billDueDate) break; // This period starts after bill is due, can't cover it

      // How much net pay is available in this period after previous allocations?
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

        // Round to 2 decimal places
        allocated = Math.round(allocated * 100) / 100;
        remaining = Math.round(remaining * 100) / 100;
      }

      if (remaining <= 0.005) break; // Effectively fully paid
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

    // Check if past due (due date before today AND not fully paid)
    if (billDueDate < today && status !== 'paid') {
      pastDueAlerts.push({
        id: bill.id,
        name: bill.name,
        dueDate: bill.due_date,
        amount: bill.amount,
      });
    }
  }

  // Build per-pay-period response
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

    // Suggest 70% to savings, 30% safe to spend
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

  // Summary
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
// Resources
// =============================================================================

async function handleResources(_req: Request): Promise<Response> {
  const db = getDb();
  const rows = db.query("SELECT * FROM resources ORDER BY category, title").all();
  return json({ resources: rows });
}

// =============================================================================
// Router
// =============================================================================

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
  if (path.startsWith("/api/insurance-deductions/")) {
    const deductionId = path.split("/")[3];
    return handleInsuranceDeductions(req, deductionId);
  }
  if (path === "/api/projection") {
    return handleProjection(req);
  }
  if (path === "/api/resources") {
    return handleResources(req);
  }

  return error("Not found", 404);
}
