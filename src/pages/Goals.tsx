import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  category: string;
  target_date: string | null;
  icon: string;
  created_at: string;
}

const CATEGORIES = [
  "Vacation",
  "Electronics",
  "Emergency",
  "Education",
  "Home",
  "Car",
  "Other",
];

const ICONS = ["🎯", "🏖️", "💻", "🚗", "🏠", "📚", "💍", "🐕", "💰", "✈️"];

const CATEGORY_BADGE: Record<string, string> = {
  vacation: "bg-blue-100 text-blue-700",
  electronics: "bg-purple-100 text-purple-700",
  emergency: "bg-red-100 text-red-700",
  education: "bg-yellow-100 text-yellow-700",
  home: "bg-green-100 text-green-700",
  car: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-600",
};

// ── helpers ──

function fmtCurrency(n: number): string {
  return "$" + n.toFixed(2);
}

function pct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 1000) / 10);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function progressColor(pctVal: number): string {
  if (pctVal >= 100) return "bg-green-500";
  if (pctVal >= 50) return "bg-indigo-500";
  if (pctVal >= 25) return "bg-yellow-500";
  return "bg-gray-400";
}

// ── component ──

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Create / edit form state
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formCategory, setFormCategory] = useState("Other");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formIcon, setFormIcon] = useState("🎯");

  // Contribute state per card
  const [contributeAmounts, setContributeAmounts] = useState<Record<number, string>>({});

  async function loadGoals() {
    try {
      const res = await apiFetch("/api/goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (err) {
      console.error("Failed to load goals:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGoals();
  }, []);

  function resetForm() {
    setFormName("");
    setFormTarget("");
    setFormCategory("Other");
    setFormTargetDate("");
    setFormIcon("🎯");
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formTarget) return;

    const body: Record<string, unknown> = {
      name: formName.trim(),
      target_amount: parseFloat(formTarget),
      category: formCategory.toLowerCase(),
      icon: formIcon,
    };
    if (formTargetDate) body.target_date = formTargetDate;

    try {
      if (editingId) {
        await apiFetch(`/api/goals/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      loadGoals();
    } catch (err) {
      console.error("Failed to save goal:", err);
    }
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id);
    setFormName(goal.name);
    setFormTarget(String(goal.target_amount));
    setFormCategory(goal.category.charAt(0).toUpperCase() + goal.category.slice(1));
    setFormTargetDate(goal.target_date || "");
    setFormIcon(goal.icon);
    setShowForm(true);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this savings goal?")) return;
    try {
      await apiFetch(`/api/goals/${id}`, { method: "DELETE" });
      loadGoals();
    } catch (err) {
      console.error("Failed to delete goal:", err);
    }
  }

  async function handleContribute(goalId: number) {
    const amountStr = contributeAmounts[goalId] || "";
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;

    try {
      await apiFetch(`/api/goals/${goalId}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      setContributeAmounts((prev) => ({ ...prev, [goalId]: "" }));
      loadGoals();
    } catch (err) {
      console.error("Failed to contribute:", err);
    }
  }

  // ── summary ──
  const totalCurrent = goals.reduce((s, g) => s + g.current_amount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const totalPct = pct(totalCurrent, totalTarget);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-400">Loading goals...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Savings Goals</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Goal"}
        </button>
      </div>

      {/* ── Summary Bar ── */}
      {goals.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-5">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-sm text-gray-500">Total saved</p>
            <p className="text-sm font-semibold text-gray-700">
              {fmtCurrency(totalCurrent)} <span className="text-gray-400 font-normal">of {fmtCurrency(totalTarget)}</span>
              <span className="ml-2 text-indigo-600">({totalPct}%)</span>
            </p>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor(totalPct)}`}
              style={{ width: `${totalPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">
            {editingId ? "Edit Goal" : "New Savings Goal"}
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Summer Vacation"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Target Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="2000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Target Date (optional)</label>
            <input
              type="date"
              value={formTargetDate}
              onChange={(e) => setFormTargetDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormIcon(icon)}
                  className={`w-10 h-10 text-xl flex items-center justify-center rounded-lg border-2 transition-colors ${
                    formIcon === icon
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              {editingId ? "Save Changes" : "Create Goal"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Empty State ── */}
      {!loading && goals.length === 0 && !showForm && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <span className="text-6xl mb-4">🎯</span>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Start saving for what matters!</h3>
          <p className="text-gray-500 max-w-sm mb-6">
            Set a savings goal and track your progress. Whether it's a vacation, new gadget, or emergency fund — PayWise helps you get there.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Add Your First Goal
          </button>
        </div>
      )}

      {/* ── Goal Cards ── */}
      <div className="space-y-4">
        {goals.map((goal) => {
          const goalPct = pct(goal.current_amount, goal.target_amount);
          const remaining = daysUntil(goal.target_date || "");
          const isOverdue = goal.target_date && remaining < 0;

          return (
            <div
              key={goal.id}
              className="rounded-xl bg-white shadow-sm border border-gray-200 p-5 space-y-4"
            >
              {/* Top row: icon, name, category badge, actions */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{goal.icon}</span>
                  <div>
                    <h4 className="font-semibold text-gray-900">{goal.name}</h4>
                    <span
                      className={`inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                        CATEGORY_BADGE[goal.category] || CATEGORY_BADGE.other
                      }`}
                    >
                      {goal.category}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => startEdit(goal)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">
                    {fmtCurrency(goal.current_amount)} of {fmtCurrency(goal.target_amount)}
                  </span>
                  <span className="font-semibold text-gray-700">{goalPct}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressColor(goalPct)}`}
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              </div>

              {/* Target date countdown */}
              {goal.target_date && (
                <p
                  className={`text-xs font-medium ${
                    isOverdue ? "text-red-500" : remaining <= 7 ? "text-orange-500" : "text-gray-500"
                  }`}
                >
                  {isOverdue
                    ? `${Math.abs(remaining)} day${Math.abs(remaining) !== 1 ? "s" : ""} overdue`
                    : remaining === 0
                      ? "Due today"
                      : `${remaining} day${remaining !== 1 ? "s" : ""} left`}
                </p>
              )}

              {/* Contribute row */}
              {goal.current_amount < goal.target_amount && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Amount"
                    value={contributeAmounts[goal.id] || ""}
                    onChange={(e) =>
                      setContributeAmounts((prev) => ({
                        ...prev,
                        [goal.id]: e.target.value,
                      }))
                    }
                    className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => handleContribute(goal.id)}
                    className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                  >
                    Add Funds
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
