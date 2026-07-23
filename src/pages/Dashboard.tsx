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

interface ProjectionDay {
  date: string;
  income: number;
  expenses: number;
  balance: number;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<PayProfile | null>(null);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [projection, setProjection] = useState<ProjectionDay[]>([]);
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
        setProjection(projData.projection || []);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const lastPeriod = periods[0];

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
          {/* Last Paycheck Card */}
          {lastPeriod && (
            <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Last Paycheck
              </p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                ${lastPeriod.net_pay.toFixed(2)}
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

          {/* 30-Day Projection Preview */}
          {projection.length > 0 && (
            <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                30-Day Projection
              </p>
              <div className="space-y-2">
                {projection.slice(0, 7).map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className={`font-medium ${day.balance < 0 ? "text-red-500" : "text-gray-900"}`}>
                      ${day.balance.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              {projection.length > 7 && (
                <p className="mt-2 text-xs text-gray-400">
                  +{projection.length - 7} more days
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
