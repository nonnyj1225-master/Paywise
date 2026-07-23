import { useState, useEffect } from "react";

interface PayProfile {
  id: number;
  hourly_rate: number;
  pay_frequency: string;
  region: string;
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

export default function Dashboard() {
  const [profile, setProfile] = useState<PayProfile | null>(null);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [profRes, perRes, projRes] = await Promise.all([
          fetch("/api/profiles/current"),
          fetch("/api/pay-periods"),
          fetch("/api/projection"),
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
    load();
  }, []);

  const lastPeriod = periods[0];
  const firstProjected = projection?.payPeriods?.[0];

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

          {/* Projection Summary */}
          {projection?.summary && (
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
