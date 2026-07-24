import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface Profile {
  id: number;
  label: string;
  hourly_rate: number;
  region: string;
}

interface ComparisonData {
  profileA: Profile;
  profileB: Profile;
  comparison: {
    hourlyRateChange: { absolute: number; percentage: number };
    averageNetPayA: number;
    averageNetPayB: number;
    netPayChange: { absolute: number; percentage: number };
    averageTaxRateA: number;
    averageTaxRateB: number;
    insuranceChange: { absolute: number; percentage: number };
    netAfterBillsA: number;
    netAfterBillsB: number;
    netAfterBillsChange: { absolute: number; percentage: number };
  };
  payPeriodsA: Array<{ start_date: string; end_date: string; net_pay: number; gross_pay: number }>;
  payPeriodsB: Array<{ start_date: string; end_date: string; net_pay: number; gross_pay: number }>;
}

// ── SVG Bar Chart Component ──
function BarChart({
  periodsA,
  periodsB,
  labelA,
  labelB,
}: {
  periodsA: Array<{ start_date: string; net_pay: number }>;
  periodsB: Array<{ start_date: string; net_pay: number }>;
  labelA: string;
  labelB: string;
}) {
  if (periodsA.length === 0 && periodsB.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No pay periods to compare.</p>;
  }

  const maxPeriods = Math.max(periodsA.length, periodsB.length);
  const allValues = [...periodsA.map((p) => p.net_pay), ...periodsB.map((p) => p.net_pay)];
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);

  // Chart dimensions
  const chartW = 600;
  const chartH = 260;
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 20;
  const paddingBottom = 40;
  const plotW = chartW - paddingLeft - paddingRight;
  const plotH = chartH - paddingTop - paddingBottom;

  // Y-axis ticks
  const yTicks = 5;
  const yRange = maxVal - minVal || 1;

  function xForIndex(i: number): number {
    return paddingLeft + (i / Math.max(maxPeriods - 1, 1)) * plotW;
  }

  function yForValue(v: number): number {
    return paddingTop + plotH - ((v - minVal) / yRange) * plotH;
  }

  const barGroupWidth = Math.min(40, (plotW / maxPeriods) * 0.7);

  // Percentage delta line data
  const deltaPoints: Array<{ x: number; y: number; pct: number }> = [];
  for (let i = 0; i < maxPeriods; i++) {
    const a = periodsA[i]?.net_pay || 0;
    const b = periodsB[i]?.net_pay || 0;
    const oldVal = a || 1;
    const pct = ((b - a) / Math.abs(oldVal)) * 100;
    // Map percentage to chart: midpoint is 0%, range goes -100% to +100%
    const clampedPct = Math.max(-100, Math.min(100, pct));
    const y = paddingTop + plotH / 2 - (clampedPct / 100) * (plotH / 2);
    deltaPoints.push({ x: xForIndex(i), y: Math.max(paddingTop, Math.min(paddingTop + plotH, y)), pct });
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full max-w-full" style={{ minWidth: "400px" }}>
        {/* Y-axis grid lines and labels */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const val = minVal + (yRange / yTicks) * i;
          const y = yForValue(val);
          return (
            <g key={i}>
              <line x1={paddingLeft} y1={y} x2={chartW - paddingRight} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="text-[10px]" fill="#9ca3af">
                ${Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {Array.from({ length: maxPeriods }).map((_, i) => {
          const x = xForIndex(i);
          const label = periodsA[i]?.start_date || periodsB[i]?.start_date || "";
          const short = label ? label.slice(5) : ""; // MM-DD
          return (
            <text key={i} x={x} y={chartH - 8} textAnchor="middle" className="text-[10px]" fill="#9ca3af">
              {short}
            </text>
          );
        })}

        {/* Bars for Job A (blue) */}
        {periodsA.map((p, i) => {
          const x = xForIndex(i) - barGroupWidth / 2;
          const h = yForValue(minVal) - yForValue(p.net_pay);
          return (
            <g key={`a-${i}`}>
              <rect
                x={x}
                y={yForValue(p.net_pay)}
                width={barGroupWidth}
                height={Math.max(h, 1)}
                fill="#3b82f6"
                rx="2"
              />
              <text
                x={x + barGroupWidth / 2}
                y={yForValue(p.net_pay) - 4}
                textAnchor="middle"
                className="text-[9px] font-semibold"
                fill="#3b82f6"
              >
                ${Math.round(p.net_pay)}
              </text>
            </g>
          );
        })}

        {/* Bars for Job B (indigo) */}
        {periodsB.map((p, i) => {
          const x = xForIndex(i) + barGroupWidth / 2 + 2;
          const h = yForValue(minVal) - yForValue(p.net_pay);
          return (
            <g key={`b-${i}`}>
              <rect
                x={x}
                y={yForValue(p.net_pay)}
                width={barGroupWidth}
                height={Math.max(h, 1)}
                fill="#6366f1"
                rx="2"
              />
              <text
                x={x + barGroupWidth / 2}
                y={yForValue(p.net_pay) - 4}
                textAnchor="middle"
                className="text-[9px] font-semibold"
                fill="#6366f1"
              >
                ${Math.round(p.net_pay)}
              </text>
            </g>
          );
        })}

        {/* Percentage delta line */}
        {deltaPoints.length >= 2 && (
          <polyline
            points={deltaPoints.map((dp) => `${dp.x},${dp.y}`).join(" ")}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeDasharray="4,2"
          />
        )}
        {deltaPoints.map((dp, i) => (
          <g key={`delta-${i}`}>
            <circle cx={dp.x} cy={dp.y} r="3" fill="#f59e0b" />
            {i % 2 === 0 && (
              <text
                x={dp.x}
                y={dp.y - 8}
                textAnchor="middle"
                className="text-[9px] font-semibold"
                fill={dp.pct >= 0 ? "#16a34a" : "#dc2626"}
              >
                {dp.pct >= 0 ? "+" : ""}{dp.pct.toFixed(0)}%
              </text>
            )}
          </g>
        ))}

        {/* Legend */}
        <rect x={paddingLeft} y={8} width={12} height={12} rx="2" fill="#3b82f6" />
        <text x={paddingLeft + 16} y={18} className="text-[10px]" fill="#4b5563">
          {labelA}
        </text>
        <rect x={paddingLeft + 100} y={8} width={12} height={12} rx="2" fill="#6366f1" />
        <text x={paddingLeft + 116} y={18} className="text-[10px]" fill="#4b5563">
          {labelB}
        </text>
        <line x1={paddingLeft + 210} y1={14} x2={paddingLeft + 240} y2={14} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,2" />
        <text x={paddingLeft + 244} y={18} className="text-[10px]" fill="#f59e0b">
          % Change
        </text>
      </svg>
    </div>
  );
}

// ── Metric Card ──
function MetricCard({
  title,
  valueA,
  valueB,
  change,
  format = "currency",
  invertGreen = false,
}: {
  title: string;
  valueA: number;
  valueB: number;
  change: { absolute: number; percentage: number };
  format?: "currency" | "percent";
  invertGreen?: boolean;
}) {
  const isPositive = change.absolute >= 0;
  const green = !invertGreen ? isPositive : !isPositive;
  const arrow = isPositive ? "↑" : "↓";

  const fmt = (v: number) => {
    if (format === "percent") return `${v.toFixed(1)}%`;
    return `$${Math.abs(v).toFixed(2)}`;
  };

  return (
    <div className="rounded-lg bg-white border border-gray-200 p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold text-gray-900">{fmt(valueB)}</span>
        <span className={`text-sm font-semibold flex items-center gap-0.5 ${green ? "text-green-600" : "text-red-500"}`}>
          <span>{arrow}</span>
          <span>{change.percentage >= 0 ? "+" : ""}{change.percentage.toFixed(1)}%</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        vs. {fmt(valueA)} ({change.absolute >= 0 ? "+" : ""}{fmt(change.absolute)})
      </p>
    </div>
  );
}

// ── Compare Page ──
export default function Compare() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileAId, setProfileAId] = useState("");
  const [profileBId, setProfileBId] = useState("");
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfiles() {
      try {
        const res = await apiFetch("/api/profiles");
        const d = await res.json();
        const all: Profile[] = (d.profiles || []).map((p: Record<string, unknown>) => ({
          id: Number(p.id),
          label: String(p.label || "My Job"),
          hourly_rate: Number(p.hourly_rate) || 0,
          region: String(p.region || ""),
        }));
        setProfiles(all);

        // Auto-select first two
        if (all.length >= 2) {
          setProfileAId(String(all[0].id));
          setProfileBId(String(all[1].id));
        } else if (all.length === 1) {
          setProfileAId(String(all[0].id));
        }
      } catch (err) {
        console.error("Failed to load profiles:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfiles();
  }, []);

  async function compare() {
    if (!profileAId || !profileBId) return;
    setComparing(true);
    setError("");
    try {
      const res = await apiFetch(`/api/compare-jobs?profile_a=${profileAId}&profile_b=${profileBId}`);
      const d = await res.json();
      if (d.error) {
        setError(d.error);
        setData(null);
      } else {
        setData(d);
      }
    } catch (err) {
      console.error("Failed to compare:", err);
      setError("Failed to load comparison data.");
    } finally {
      setComparing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Compare Jobs</h2>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (profiles.length < 2) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Compare Jobs</h2>
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-gray-500">Add at least two job profiles to compare them.</p>
          <p className="text-sm text-gray-400 mt-1">
            Go to <strong>Settings</strong> to add job history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Compare Jobs</h2>
      <p className="text-sm text-gray-500 -mt-4">
        See how different jobs stack up on pay, taxes, and take-home income.
      </p>

      {/* Selector */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job A (baseline)</label>
            <select
              value={profileAId}
              onChange={(e) => setProfileAId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (${p.hourly_rate.toFixed(2)}/hr)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job B (compare)</label>
            <select
              value={profileBId}
              onChange={(e) => setProfileBId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (${p.hourly_rate.toFixed(2)}/hr)
                </option>
              ))}
            </select>
          </div>
        </div>

        {profileAId === profileBId && (
          <p className="text-xs text-amber-600">Select two different jobs to compare.</p>
        )}

        <button
          onClick={compare}
          disabled={comparing || !profileAId || !profileBId || profileAId === profileBId}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {comparing ? "Comparing..." : "Compare Jobs"}
        </button>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              title="Hourly Rate"
              valueA={data.profileA.hourly_rate}
              valueB={data.profileB.hourly_rate}
              change={data.comparison.hourlyRateChange}
            />
            <MetricCard
              title="Avg Net Pay"
              valueA={data.comparison.averageNetPayA}
              valueB={data.comparison.averageNetPayB}
              change={data.comparison.netPayChange}
            />
            <MetricCard
              title="Tax Rate"
              valueA={data.comparison.averageTaxRateA}
              valueB={data.comparison.averageTaxRateB}
              change={{
                absolute: data.comparison.averageTaxRateB - data.comparison.averageTaxRateA,
                percentage:
                  data.comparison.averageTaxRateA > 0
                    ? ((data.comparison.averageTaxRateB - data.comparison.averageTaxRateA) /
                        data.comparison.averageTaxRateA) *
                      100
                    : 0,
              }}
              format="percent"
              invertGreen
            />
            <MetricCard
              title="After Bills"
              valueA={data.comparison.netAfterBillsA}
              valueB={data.comparison.netAfterBillsB}
              change={data.comparison.netAfterBillsChange}
            />
          </div>

          {/* Bar Chart */}
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Net Pay by Pay Period</h3>
            <BarChart
              periodsA={data.payPeriodsA}
              periodsB={data.payPeriodsB}
              labelA={data.profileA.label}
              labelB={data.profileB.label}
            />
            <p className="mt-3 text-xs text-gray-400 text-center">
              Dashed orange line shows % change between jobs across periods
            </p>
          </div>
        </>
      )}
    </div>
  );
}
