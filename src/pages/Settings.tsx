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
  const [dedPercentage, setDedPercentage] = useState("");
  const [dedFixed, setDedFixed] = useState("");

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
    try {
      await fetch("/api/insurance-deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dedName,
          percentage: parseFloat(dedPercentage) || 0,
          fixed_amount: dedFixed ? parseFloat(dedFixed) : null,
          per_pay_period: true,
        }),
      });
      setDedName("");
      setDedPercentage("");
      setDedFixed("");
      loadData();
    } catch (err) {
      console.error("Failed to add deduction:", err);
    }
  }

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
                placeholder="15.00"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Region (for tax estimate)</label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. US, CA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Tax Rate (%)
                <span className="text-xs text-gray-400 ml-1">— leave blank for auto</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={customTaxRate}
                onChange={(e) => setCustomTaxRate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Auto"
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

            {deductions.length > 0 && (
              <div className="space-y-2">
                {deductions.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-900 capitalize">{d.name}</span>
                      <span className="text-gray-500 ml-2">
                        {d.percentage}%{d.fixed_amount ? ` + $${d.fixed_amount}` : ""}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">per period</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={addDeduction} className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">Add a deduction (health, dental, vision, etc.)</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={dedName}
                  onChange={(e) => setDedName(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Name"
                />
                <input
                  type="number"
                  step="0.1"
                  value={dedPercentage}
                  onChange={(e) => setDedPercentage(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="% of pay"
                />
                <input
                  type="number"
                  step="0.01"
                  value={dedFixed}
                  onChange={(e) => setDedFixed(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Fixed $"
                />
              </div>
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
