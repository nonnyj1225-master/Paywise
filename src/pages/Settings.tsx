import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface PayProfile {
  id: number;
  hourly_rate: number;
  pay_frequency: string;
  region: string;
  custom_tax_rate: number | null;
  label: string;
  is_active: number;
  started_at: string;
  ended_at: string | null;
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

const NO_TAX_STATES = new Set(["FL", "TX", "WA", "NV", "SD", "WY", "AK", "TN", "NH"]);

export default function Settings() {
  const [profiles, setProfiles] = useState<PayProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<PayProfile | null>(null);
  const [deductions, setDeductions] = useState<InsuranceDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // "Add New Job" / edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formHourlyRate, setFormHourlyRate] = useState("");
  const [formPayFrequency, setFormPayFrequency] = useState("bi-weekly");
  const [formRegion, setFormRegion] = useState("");
  const [formCustomTaxRate, setFormCustomTaxRate] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(new Date().toISOString().split("T")[0]);
  const [formEndedAt, setFormEndedAt] = useState("");

  // Deduction form
  const [dedName, setDedName] = useState("");
  const [dedMode, setDedMode] = useState<"percentage" | "learn" | "fixed">("percentage");
  const [dedPercentage, setDedPercentage] = useState("");
  const [dedFixed, setDedFixed] = useState("");
  const [dedActualDeducted, setDedActualDeducted] = useState("");
  const [dedReferenceGross, setDedReferenceGross] = useState("");

  async function loadData() {
    try {
      const [profRes, dedRes] = await Promise.all([
        apiFetch("/api/profiles"),
        apiFetch("/api/insurance-deductions"),
      ]);
      const profData = await profRes.json();
      const dedData = await dedRes.json();

      const allProfiles: PayProfile[] = profData.profiles || [];
      setProfiles(allProfiles);
      const active = allProfiles.find(p => p.is_active) || allProfiles[0] || null;
      setActiveProfile(active);
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

  function openNewForm() {
    setEditingId(null);
    setFormLabel("");
    setFormHourlyRate("");
    setFormPayFrequency("bi-weekly");
    setFormRegion("");
    setFormCustomTaxRate("");
    setFormStartedAt(new Date().toISOString().split("T")[0]);
    setFormEndedAt("");
    setShowForm(true);
  }

  function openEditForm(profile: PayProfile) {
    setEditingId(profile.id);
    setFormLabel(profile.label || "");
    setFormHourlyRate(String(profile.hourly_rate || ""));
    setFormPayFrequency(profile.pay_frequency || "bi-weekly");
    setFormRegion(profile.region || "");
    setFormCustomTaxRate(profile.custom_tax_rate != null ? String(profile.custom_tax_rate) : "");
    setFormStartedAt(profile.started_at || "");
    setFormEndedAt(profile.ended_at || "");
    setShowForm(true);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body: Record<string, unknown> = {
        hourly_rate: parseFloat(formHourlyRate) || 0,
        pay_frequency: formPayFrequency,
        region: formRegion,
        custom_tax_rate: formCustomTaxRate ? parseFloat(formCustomTaxRate) / 100 : null,
        label: formLabel || "My Job",
        started_at: formStartedAt,
        ended_at: formEndedAt || null,
      };

      let res: Response;
      if (editingId) {
        res = await apiFetch(`/api/profiles/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await apiFetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (data.profile) {
        setMessage(editingId ? "Job updated!" : "New job added!");
        setShowForm(false);
        loadData();
      } else if (data.error) {
        setMessage("Error: " + data.error);
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      setMessage("Error saving profile.");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  async function activateProfile(id: number) {
    try {
      const res = await apiFetch(`/api/profiles/${id}/activate`, { method: "POST" });
      const data = await res.json();
      if (data.profile) {
        setMessage("Job switched!");
        loadData();
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      console.error("Failed to activate profile:", err);
    }
  }

  async function deleteProfile(id: number) {
    if (!confirm("Delete this job? This cannot be undone.")) return;
    try {
      const res = await apiFetch(`/api/profiles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) {
        setMessage("Error: " + data.error);
        setTimeout(() => setMessage(""), 3000);
      } else {
        loadData();
      }
    } catch (err) {
      console.error("Failed to delete profile:", err);
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
      await apiFetch("/api/insurance-deductions", {
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
      await apiFetch(`/api/insurance-deductions/${id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      console.error("Failed to delete deduction:", err);
    }
  }

  const estimatedTaxRate = (() => {
    if (activeProfile?.custom_tax_rate) return activeProfile.custom_tax_rate * 100;
    if (activeProfile?.region && activeProfile.region.length === 2) {
      return NO_TAX_STATES.has(activeProfile.region.toUpperCase()) ? 22 : 25;
    }
    return 22;
  })();

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

      {/* Job History */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Job History</h3>
          <button
            onClick={openNewForm}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            + Add New Job
          </button>
        </div>

        {message && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            {message}
          </div>
        )}

        {profiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
            <p className="text-gray-500">No job profiles yet.</p>
            <p className="text-sm text-gray-400 mt-1">Add your first job to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`rounded-lg border p-4 ${
                  profile.is_active
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{profile.label || "My Job"}</span>
                      {profile.is_active ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      <p>${Number(profile.hourly_rate).toFixed(2)}/hr · {profile.pay_frequency}</p>
                      <p className="text-xs text-gray-400">
                        Started {new Date(profile.started_at + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        {profile.ended_at
                          ? ` · Ended ${new Date(profile.ended_at + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
                          : " · Current"}
                      </p>
                      {profile.region && (
                        <p className="text-xs text-gray-400">
                          Region: {profile.region.toUpperCase()}
                          {profile.custom_tax_rate != null ? ` · Custom tax: ${(Number(profile.custom_tax_rate) * 100).toFixed(1)}%` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!profile.is_active && (
                      <button
                        onClick={() => activateProfile(profile.id)}
                        className="rounded-lg bg-indigo-100 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200 transition-colors"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => openEditForm(profile)}
                      className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      Edit
                    </button>
                    {profiles.length > 1 && (
                      <button
                        onClick={() => deleteProfile(profile.id)}
                        className="rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1.5 text-xs transition-colors"
                        title="Delete"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Job Form */}
        {showForm && (
          <form onSubmit={saveProfile} className="space-y-4 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-700">
              {editingId ? "Edit Job" : "Add New Job"}
            </h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Warehouse Job, Delivery Gig"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate ($)</label>
              <input
                type="number"
                step="0.01"
                value={formHourlyRate}
                onChange={(e) => setFormHourlyRate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. 15.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
              <select
                value={formPayFrequency}
                onChange={(e) => setFormPayFrequency(e.target.value)}
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
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {US_STATES.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Tax Rate (%)
                <span className="text-xs text-gray-400 ml-1">— leave blank for state estimate</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={formCustomTaxRate}
                onChange={(e) => setFormCustomTaxRate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Use state estimate"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={formStartedAt}
                  onChange={(e) => setFormStartedAt(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date <span className="text-xs text-gray-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={formEndedAt}
                  onChange={(e) => setFormEndedAt(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update Job" : "Add Job"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Active Profile Quick Stats */}
      {activeProfile && (
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Current Job</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Label</p>
              <p className="font-semibold text-gray-900">{activeProfile.label || "My Job"}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Hourly Rate</p>
              <p className="font-semibold text-indigo-600">${Number(activeProfile.hourly_rate).toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Pay Schedule</p>
              <p className="font-semibold text-gray-900 capitalize">{activeProfile.pay_frequency}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Est. Tax Rate</p>
              <p className="font-semibold text-gray-900">~{estimatedTaxRate}%</p>
            </div>
          </div>
        </div>
      )}

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

          {dedMode === "percentage" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Percentage of gross pay</label>
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Amount deducted ($)</label>
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Gross pay on that check ($)</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Fixed dollar amount per check ($)</label>
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
    </div>
  );
}
