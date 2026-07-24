import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface PayProfile {
  id: number;
  hourly_rate: number;
  pay_frequency: string;
  region: string;
  label: string;
  is_active: number;
}

interface PayPeriod {
  id: number;
  hours_worked: number;
  gross_pay: number;
  tax_amount: number;
  net_pay: number;
  insurance_deductions: number;
  start_date: string;
  end_date: string;
}

interface ProjectedBill {
  id: number;
  name: string;
  amount: number;
  dueDate: string;
  category: string;
  priority: number;
  status: string;
}

interface ProjectedPeriod {
  startDate: string;
  endDate: string;
  grossPay: number;
  taxAmount: number;
  insuranceDeductions: number;
  netPay: number;
  bills: ProjectedBill[];
  remaining: number;
  safeToSpend: number;
  suggestedSavings: number;
}

interface ProjectionSummary {
  totalBills: number;
  coveredBills: number;
  uncoveredBills: number;
  pastDueAlerts: Array<{ id: number; name: string; dueDate: string; amount: number }>;
  projectedSavings: number;
}

interface ProjectionData {
  payPeriods: ProjectedPeriod[];
  summary: ProjectionSummary;
  message?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  housing: "bg-red-100 text-red-700 border-red-200",
  utilities: "bg-orange-100 text-orange-700 border-orange-200",
  food: "bg-green-100 text-green-700 border-green-200",
  transportation: "bg-blue-100 text-blue-700 border-blue-200",
  insurance: "bg-purple-100 text-purple-700 border-purple-200",
  subscriptions: "bg-pink-100 text-pink-700 border-pink-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_COLORS: Record<string, string> = {
  paid: "text-green-600",
  partial: "text-amber-600",
  unpaid: "text-red-500",
};

// ── Date helpers for smart defaults ──

function getPayPeriodDates(
  frequency: string
): { startDate: string; endDate: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (frequency) {
    case "weekly": {
      // Start = most recent Monday, End = this coming Sunday
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysSinceMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        startDate: monday.toISOString().split("T")[0],
        endDate: sunday.toISOString().split("T")[0],
      };
    }
    case "bi-weekly": {
      // Start = most recent Monday, End = start + 13 days
      const dayOfWeek = today.getDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysSinceMonday);
      const endDate = new Date(monday);
      endDate.setDate(monday.getDate() + 13);
      return {
        startDate: monday.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      };
    }
    case "monthly": {
      // Start = 1st of current month, End = last day of current month
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        startDate: first.toISOString().split("T")[0],
        endDate: last.toISOString().split("T")[0],
      };
    }
    default: {
      const start = today.toISOString().split("T")[0];
      const end = new Date(today);
      end.setDate(today.getDate() + 13);
      return { startDate: start, endDate: end.toISOString().split("T")[0] };
    }
  }
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

export default function Dashboard() {
  const [profile, setProfile] = useState<PayProfile | null>(null);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);

  // Enter Hours form state
  const defaultDates = profile
    ? getPayPeriodDates(profile.pay_frequency)
    : { startDate: "", endDate: "" };
  const [hoursWorked, setHoursWorked] = useState("");
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Update date defaults when profile changes
  useEffect(() => {
    if (profile) {
      const dates = getPayPeriodDates(profile.pay_frequency);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  }, [profile?.pay_frequency]);

  async function loadDashboard() {
    try {
      const [profRes, perRes, projRes] = await Promise.all([
        apiFetch("/api/profiles/current"),
        apiFetch("/api/pay-periods"),
        apiFetch("/api/projection"),
      ]);
      const profData = await profRes.json();
      const perData = await perRes.json();
      const projData = await projRes.json();

      setProfile(profData.profile || null);
      setPeriods(perData.pay_periods || []);
      setProjection(projData.payPeriods ? projData : null);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleSubmitHours(e: React.FormEvent) {
    e.preventDefault();
    if (!hoursWorked || parseFloat(hoursWorked) < 0) {
      setErrorMsg("Please enter a valid number of hours.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await apiFetch("/api/pay-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours_worked: parseFloat(hoursWorked),
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to save hours.");
        setTimeout(() => setErrorMsg(""), 4000);
        return;
      }

      // Reset form and refresh
      setHoursWorked("");
      setSuccessMsg("Paycheck calculated! See your updated projection below.");
      setTimeout(() => setSuccessMsg(""), 5000);
      await loadDashboard();
    } catch (err) {
      console.error("Failed to add pay period:", err);
      setErrorMsg("Network error. Please try again.");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setSubmitting(false);
    }
  }

  const lastPeriod = periods[0];
  const firstProjected = projection?.payPeriods?.[0];
  const hasBills = projection?.summary && projection.summary.totalBills > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !profile ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-gray-500 mb-2">Welcome to PayWise!</p>
          <p className="text-sm text-gray-400">
            Head to <strong>Settings</strong> to set up your pay profile.
          </p>
        </div>
      ) : (
        <>
          {/* ── Enter Hours Card ── */}
          <div className="rounded-xl bg-white p-5 shadow-sm border border-indigo-200 ring-1 ring-indigo-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <span>🕐</span> Enter Hours Worked
            </h3>
            {profile.label && (
              <p className="text-xs text-indigo-600 font-medium mb-3">
                Job: {profile.label} — ${Number(profile.hourly_rate).toFixed(2)}/hr
              </p>
            )}

            {errorMsg && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                ✓ {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmitHours} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hours Worked This Period
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={hoursWorked}
                  onChange={(e) => setHoursWorked(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pay Period Start
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pay Period End
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Auto-filled based on your{" "}
                <span className="font-medium text-gray-500 capitalize">{profile.pay_frequency}</span>{" "}
                pay schedule. Adjust dates if needed.
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "Calculating..." : "Calculate Paycheck"}
              </button>
            </form>
          </div>

          {/* Past Due Alerts */}
          {projection?.summary?.pastDueAlerts && projection.summary.pastDueAlerts.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-semibold text-red-800 mb-2">⚠️ Past Due Bills</p>
              <div className="space-y-1">
                {projection.summary.pastDueAlerts.map(alert => (
                  <div key={alert.id} className="flex justify-between text-sm text-red-700">
                    <span>{alert.name} (due {new Date(alert.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>
                    <span className="font-medium">${alert.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last Paycheck Card */}
          {lastPeriod && (
            <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Last Paycheck
              </p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                ${lastPeriod.net_pay.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(lastPeriod.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} —{" "}
                {new Date(lastPeriod.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-500">
                <div>
                  <span className="block text-xs">Gross</span>
                  ${lastPeriod.gross_pay.toFixed(2)}
                </div>
                <div>
                  <span className="block text-xs">Tax</span>
                  ${lastPeriod.tax_amount.toFixed(2)}
                </div>
                <div>
                  <span className="block text-xs">Insurance</span>
                  ${lastPeriod.insurance_deductions.toFixed(2)}
                </div>
                <div>
                  <span className="block text-xs">Hours</span>
                  {lastPeriod.hours_worked}h
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Hourly Rate</p>
              <p className="mt-1 text-xl font-bold text-indigo-600">
                ${Number(profile.hourly_rate).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase">Pay Schedule</p>
              <p className="mt-1 text-xl font-bold text-indigo-600 capitalize">
                {profile.pay_frequency}
              </p>
            </div>
          </div>

          {/* No bills yet message */}
          {!hasBills && !loading && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
              <p className="text-gray-500">Add some bills to see your projection</p>
              <p className="text-sm text-gray-400 mt-1">
                Head to <strong>Bills</strong> to add your recurring expenses and get a personalized plan.
              </p>
            </div>
          )}

          {/* Projection Summary */}
          {hasBills && projection?.summary && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-white p-3 shadow-sm border border-gray-200 text-center">
                <p className="text-2xl font-bold text-gray-900">{projection.summary.coveredBills}</p>
                <p className="text-xs text-gray-500">Covered Bills</p>
              </div>
              <div className="rounded-lg bg-white p-3 shadow-sm border border-gray-200 text-center">
                <p className={`text-2xl font-bold ${projection.summary.uncoveredBills > 0 ? "text-red-500" : "text-gray-900"}`}>
                  {projection.summary.uncoveredBills}
                </p>
                <p className="text-xs text-gray-500">At Risk</p>
              </div>
              <div className="rounded-lg bg-white p-3 shadow-sm border border-gray-200 text-center">
                <p className="text-2xl font-bold text-green-600">${projection.summary.projectedSavings.toFixed(0)}</p>
                <p className="text-xs text-gray-500">Projected Savings</p>
              </div>
            </div>
          )}

          {/* Upcoming Pay Period Projection */}
          {firstProjected && (
            <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                Upcoming Pay Period
              </p>
              <p className="text-xs text-gray-400 mb-4">
                {new Date(firstProjected.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} —{" "}
                {new Date(firstProjected.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>

              {/* Net Pay */}
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-sm text-gray-600">Estimated Net Pay</span>
                <span className="text-2xl font-bold text-indigo-600">${firstProjected.netPay.toFixed(2)}</span>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
                <div className="rounded bg-gray-50 py-2">
                  <span className="block text-xs text-gray-500">Gross</span>
                  <span className="font-semibold">${firstProjected.grossPay.toFixed(0)}</span>
                </div>
                <div className="rounded bg-gray-50 py-2">
                  <span className="block text-xs text-gray-500">Tax</span>
                  <span className="font-semibold text-red-500">-${firstProjected.taxAmount.toFixed(0)}</span>
                </div>
                <div className="rounded bg-gray-50 py-2">
                  <span className="block text-xs text-gray-500">Insurance</span>
                  <span className="font-semibold text-red-500">-${firstProjected.insuranceDeductions.toFixed(0)}</span>
                </div>
              </div>

              {/* Bill Allocation */}
              {firstProjected.bills.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Best Course of Action — Bills to Pay
                  </p>
                  <div className="space-y-1.5">
                    {firstProjected.bills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[bill.status]?.replace("text-", "bg-") || "bg-gray-400"}`} />
                          <span className="font-medium text-gray-900 truncate">{bill.name}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${CATEGORY_COLORS[bill.category] || CATEGORY_COLORS.other}`}>
                            {bill.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400">
                            Due {new Date(bill.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span className={`text-xs font-medium ${STATUS_COLORS[bill.status] || ""}`}>
                            {bill.status === "paid" ? `$${bill.amount.toFixed(2)}` :
                             bill.status === "partial" ? `$${bill.amount.toFixed(2)}` :
                             "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Remaining */}
              <div className="flex justify-between text-sm pt-3 border-t border-gray-100">
                <div>
                  <span className="text-gray-500">Safe to Spend</span>
                  <span className="ml-2 font-bold text-green-600">${firstProjected.safeToSpend.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Suggested Savings</span>
                  <span className="ml-2 font-bold text-indigo-600">${firstProjected.suggestedSavings.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* All Projected Periods (collapsed summary) */}
          {projection?.payPeriods && projection.payPeriods.length > 1 && (
            <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                30-Day Outlook
              </p>
              <div className="space-y-3">
                {projection.payPeriods.map((pp, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-gray-600">
                        {new Date(pp.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" — "}
                        {new Date(pp.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        ({pp.bills.length} bill{pp.bills.length !== 1 ? "s" : ""})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">${pp.netPay.toFixed(2)}</span>
                      <span className={`ml-2 text-xs ${pp.remaining >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {pp.remaining >= 0 ? `+$${pp.remaining.toFixed(2)}` : `-$${Math.abs(pp.remaining).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
