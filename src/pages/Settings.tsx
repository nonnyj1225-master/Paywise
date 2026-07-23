import { useState, useEffect } from "react";

interface PayProfile {
  id: number;
  hourly_rate: number;
  pay_frequency: string;
  region: string;
  custom_tax_rate: number | null;
}

interface InsuranceDeduction {
  id: number;
  name: string;
  percentage: number;
  fixed_amount: number | null;
  per_pay_period: number;
}

const US_STATES: [string, string][] = [
  ["", "Auto-detect (22% default)"],
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"],
];

// States with no income tax
const NO_TAX_STATES = new Set(["FL", "TX", "WA", "NV", "SD", "WY", "AK", "TN", "NH"]);

export default function Settings() {
  const [profile, setProfile] = useState<PayProfile | null>(null);
  const [deductions, setDeductions] = useState<InsuranceDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Profile form
  const [hourlyRate, setHourlyRate] = useState("");
  const [payFrequency, setPayFrequency] = useState("bi-weekly");
  const [region, setRegion] = useState("");
  const [customTaxRate, setCustomTaxRate] = useState("");

  // Deduction form
  const [dedName, setDedName] = useState("");
  const [dedMode, setDedMode] = useState<"percentage" | "learn" | "fixed">("percentage");
  const [dedPercentage, setDedPercentage] = useState("");
  const [dedFixed, setDedFixed] = useState("");
  // "Learn from my check" fields
  const [dedActualDeducted, setDedActualDeducted] = useState("");
  const [dedReferenceGross, setDedReferenceGross] = useState("");

  async function loadData() {
    try {
      const [profRes, dedRes] = await Promise.all([
        fetch("/api/profiles/current"),
        fetch("/api/insurance-deductions"),
      ]);
      const profData = await profRes.json();
      const dedData = await dedRes.json();

      if (profData.profile) {
        setProfile(profData.profile);
        setHourlyRate(String(profData.profile.hourly_rate || ""));
        setPayFrequency(profData.profile.pay_frequency || "bi-weekly");
        setRegion(profData.profile.region || "");
        setCustomTaxRate(profData.profile.custom_tax_rate != null ? String(profData.profile.custom_tax_rate) : "");
      }
      setDeductions(dedData.insurance_deductions || []);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hourly_rate: parseFloat(hourlyRate) || 0,
          pay_frequency: payFrequency,
          region,
          custom_tax_rate: customTaxRate ? parseFloat(customTaxRate) / 100 : null,
        }),
      });
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        setMessage("Profile saved!");
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      setMessage("Error saving profile.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  async function addDeduction(e: React.FormEvent) {
    e.preventDefault();
    if (!dedName) return;

    const body: Record<string, unknown> = {
      name: dedName,
      per_pay_period: dedMode !== "fixed",
    };

    if (dedMode === "learn") {
      body.actual_deducted = parseFloat(dedActualDeducted) || 0;
      body.reference_gross = parseFloat(dedReferenceGross) || 0;
    } else if (dedMode === "percentage") {
      body.percentage = parseFloat(dedPercentage) || 0;
    } else {
      body.fixed_amount = parseFloat(dedFixed) || 0;
      body.percentage = 0;
    }

    try {
      await fetch("/api/insurance-deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setDedName("");
      setDedPercentage("");
      setDedFixed("");
      setDedActualDeducted("");
      setDedReferenceGross("");
      setDedMode("percentage");
      loadData();
    } catch (err) {
      console.error("Failed to add deduction:", err);
    }
  }

  async function deleteDeduction(id: number) {
    try {
      await fetch(`/api/insurance-deductions/${id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      console.error("Failed to delete deduction:", err);
    }
  }

  const estimatedTaxRate = (() => {
    if (customTaxRate) return parseFloat(customTaxRate);
    if (region && region.length === 2) {
      // Provide a rough estimate for display
      const noTax = NO_TAX_STATES.has(region.toUpperCase());
      return noTax ? 22 : 25;
    }
    return 22;
  })();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Pay Profile */}
          <form onSubmit={saveProfile} className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Pay Profile</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
              <input
                type="number"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. 15.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
              <select
                value={payFrequency}
                onChange={(e) => setPayFrequency(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State (for tax estimation)
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {US_STATES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              {region && (
                <p className="mt-1 text-xs text-gray-400">
                  Estimated effective tax rate: ~{estimatedTaxRate}%
                  {NO_TAX_STATES.has(region.toUpperCase()) ? " (no state income tax)" : " (federal + state combined)"}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Tax Rate (%)
                <span className="text-xs text-gray-400 ml-1">— leave blank to use state estimate</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={customTaxRate}
                onChange={(e) => setCustomTaxRate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Use state estimate"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
              {message && <span className="text-sm text-green-600">{message}</span>}
            </div>
          </form>

          {/* Insurance Deductions */}
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Insurance Deductions</h3>
            <p className="text-xs text-gray-500">
              Track health, dental, vision, and other insurance deductions from your paycheck.
            </p>

            {deductions.length > 0 && (
              <div className="space-y-2">
                {deductions.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{d.name}</span>
                      <span className="text-gray-500 ml-2">
                        {d.per_pay_period ? (
                          <>
                            {d.percentage > 0 ? `${d.percentage}% of gross` : ""}
                            {d.percentage > 0 && d.fixed_amount ? " + " : ""}
                            {d.fixed_amount ? `$${Number(d.fixed_amount).toFixed(2)}` : ""}
                            {!d.percentage && !d.fixed_amount ? "0%" : ""}
                            {" "}per check
                          </>
                        ) : (
                          <>{d.fixed_amount ? `$${Number(d.fixed_amount).toFixed(2)}` : ""} (not per-period)</>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteDeduction(d.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors text-xs ml-2"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Deduction Form */}
            <form onSubmit={addDeduction} className="space-y-3 border-t border-gray-100 pt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deduction Name</label>
                <input
                  type="text"
                  value={dedName}
                  onChange={(e) => setDedName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Health insurance, dental, vision, etc."
                />
              </div>

              {/* Mode selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">How would you like to enter this?</label>
                <div className="flex flex-wrap gap-2">
                  {(["percentage", "learn", "fixed"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDedMode(mode)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        dedMode === mode
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {mode === "percentage" && "% of gross pay"}
                      {mode === "learn" && "Learn from last check"}
                      {mode === "fixed" && "Fixed dollar amount"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode-specific inputs */}
              {dedMode === "percentage" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Percentage of gross pay
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={dedPercentage}
                      onChange={(e) => setDedPercentage(e.target.value)}
                      className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. 5"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              )}

              {dedMode === "learn" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-3">
                  <p className="text-xs text-amber-800 font-medium">
                    📋 Enter the dollar amount deducted from your last paycheck and the gross pay on that check.
                    PayWise will calculate the percentage and apply it going forward.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Amount deducted ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={dedActualDeducted}
                        onChange={(e) => setDedActualDeducted(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder="e.g. 85.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Gross pay on that check ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={dedReferenceGross}
                        onChange={(e) => setDedReferenceGross(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder="e.g. 1600.00"
                      />
                    </div>
                  </div>
                  {dedActualDeducted && dedReferenceGross && parseFloat(dedReferenceGross) > 0 && (
                    <p className="text-xs text-amber-700">
                      Calculated: {((parseFloat(dedActualDeducted) / parseFloat(dedReferenceGross)) * 100).toFixed(2)}% of gross
                    </p>
                  )}
                </div>
              )}

              {dedMode === "fixed" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fixed dollar amount per check ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={dedFixed}
                    onChange={(e) => setDedFixed(e.target.value)}
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 25.00"
                  />
                </div>
              )}

              <button
                type="submit"
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                + Add Deduction
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
