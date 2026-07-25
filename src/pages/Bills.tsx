import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";
import ConfirmModal from "../components/ConfirmModal";
import ToastContainer, { type ToastData } from "../components/Toast";

interface Bill {
  id: number;
  name: string;
  amount: number;
  due_date: string;
  category: string;
  priority: number;
  recurring: number;
  frequency: string;
  deleted_at: string | null;
}

const CATEGORIES = [
  "housing",
  "utilities",
  "subscriptions",
  "food",
  "transportation",
  "insurance",
  "other",
];

const FREQUENCIES: [string, string][] = [
  ["weekly", "Weekly"],
  ["bi-weekly", "Bi-Weekly"],
  ["monthly", "Monthly"],
  ["semi-monthly", "Semi-Monthly"],
  ["quarterly", "Quarterly"],
];

const FREQUENCY_BADGE_LABEL: Record<string, string> = {
  "weekly": "Every week",
  "bi-weekly": "Every 2 weeks",
  "monthly": "Monthly",
  "semi-monthly": "Twice monthly",
  "quarterly": "Every 3 months",
};

const CATEGORY_COLORS: Record<string, string> = {
  housing: "border-l-red-500 bg-red-50",
  utilities: "border-l-orange-500 bg-orange-50",
  food: "border-l-green-500 bg-green-50",
  transportation: "border-l-blue-500 bg-blue-50",
  insurance: "border-l-purple-500 bg-purple-50",
  subscriptions: "border-l-pink-500 bg-pink-50",
  other: "border-l-gray-400 bg-gray-50",
};

const CATEGORY_BADGE: Record<string, string> = {
  housing: "bg-red-100 text-red-700",
  utilities: "bg-orange-100 text-orange-700",
  food: "bg-green-100 text-green-700",
  transportation: "bg-blue-100 text-blue-700",
  insurance: "bg-purple-100 text-purple-700",
  subscriptions: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-gray-600",
};

// Consequence ranking for visual ordering
const CATEGORY_RANK: Record<string, number> = {
  housing: 1,
  utilities: 2,
  food: 3,
  transportation: 4,
  insurance: 5,
  subscriptions: 6,
  other: 7,
};

const FREQUENCY_INTERVAL: Record<string, number> = {
  "weekly": 7,
  "bi-weekly": 14,
  "semi-monthly": 15,
  "monthly": 30,
  "quarterly": 90,
};

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<"priority" | "date" | "amount">("priority");

  // Form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("3");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState("monthly");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastData[]>([]);
  let toastIdCounter = 0;
  const addToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, actionLabel, onAction }]);
    // Auto dismiss after 6s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  async function loadBills() {
    try {
      const res = await apiFetch("/api/bills");
      const data = await res.json();
      setBills(data.bills || []);
    } catch (err) {
      console.error("Failed to load bills:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBills();
  }, []);

  function resetForm() {
    setName("");
    setAmount("");
    setDueDate("");
    setCategory("other");
    setPriority("3");
    setRecurring(false);
    setFrequency("monthly");
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(bill: Bill) {
    setEditingId(bill.id);
    setName(bill.name);
    setAmount(String(bill.amount));
    setDueDate(bill.due_date);
    setCategory(bill.category);
    setPriority(String(bill.priority));
    setRecurring(bill.recurring === 1);
    setFrequency(bill.frequency || "monthly");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body: Record<string, unknown> = {
        name,
        amount: parseFloat(amount),
        due_date: dueDate,
        category,
        priority: parseInt(priority),
        recurring,
        frequency: recurring ? frequency : "monthly",
      };

      if (editingId) {
        await apiFetch(`/api/bills/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      loadBills();
    } catch (err) {
      console.error("Failed to save bill:", err);
    }
  }

  async function handleDelete(bill: Bill) {
    try {
      await apiFetch(`/api/bills/${bill.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      addToast(`"${bill.name}" deleted.`, "Undo", async () => {
        // Undo: set deleted_at to null
        await apiFetch(`/api/bills/${bill.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleted_at: null }),
        });
        loadBills();
      });
      loadBills();
    } catch (err) {
      console.error("Failed to delete bill:", err);
    }
  }

  const priorityLabel = (p: number) => {
    const labels: Record<number, string> = { 1: "Low", 2: "Med-Low", 3: "Medium", 4: "High", 5: "Urgent" };
    return labels[p] || "Medium";
  };

  const priorityBadge = (p: number) => {
    if (p >= 5) return "bg-red-100 text-red-700";
    if (p >= 4) return "bg-orange-100 text-orange-700";
    if (p >= 3) return "bg-yellow-100 text-yellow-700";
    return "bg-blue-100 text-blue-700";
  };

  // Compute next occurrence for non-monthly recurring bills
  function getNextOccurrence(bill: Bill): string | null {
    if (!bill.recurring || bill.frequency === "monthly" || !bill.frequency) return null;
    const interval = FREQUENCY_INTERVAL[bill.frequency] || 30;
    const due = new Date(bill.due_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the next occurrence that is >= today
    let next = new Date(due);
    while (next < today) {
      next.setDate(next.getDate() + interval);
    }
    return next.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Sort bills by the selected sort mode
  const sortedBills = [...bills].sort((a, b) => {
    if (sortMode === "priority") {
      const rankA = CATEGORY_RANK[a.category] || 7;
      const rankB = CATEGORY_RANK[b.category] || 7;
      if (rankA !== rankB) return rankA - rankB;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (sortMode === "date") {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    return a.amount - b.amount;
  });

  const totalDue = bills
    .filter((b) => new Date(b.due_date + "T00:00:00") >= new Date(new Date().toDateString()))
    .reduce((sum, b) => sum + b.amount, 0);

  const upcomingCount = bills.filter(
    (b) => new Date(b.due_date + "T00:00:00") >= new Date(new Date().toDateString())
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Bills</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Bill"}
        </button>
      </div>

      {/* Summary */}
      {bills.length > 0 && (
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {bills.length} bill{bills.length !== 1 ? "s" : ""} · {upcomingCount} upcoming ·{" "}
              <span className="font-bold text-gray-900">${totalDue.toFixed(2)}</span> due
            </p>
            {/* Sort controls */}
            <div className="flex gap-1">
              {(["priority", "date", "amount"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    sortMode === mode
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {mode === "priority" && "By Priority"}
                  {mode === "date" && "By Date"}
                  {mode === "amount" && "By Amount"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Bill Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
          <h3 className="font-semibold text-gray-800">
            {editingId ? "Edit Bill" : "Add New Bill"}
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bill Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="Rent, Netflix, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    {p} - {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Recurring bill
          </label>
          {recurring && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                {FREQUENCIES.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              {editingId ? "Update Bill" : "Save Bill"}
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

      {/* Bill List */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : bills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-gray-500">No bills yet. Add your first bill above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedBills.map((bill, index) => {
            const nextOcc = getNextOccurrence(bill);
            return (
              <div
                key={bill.id}
                className={`flex items-center justify-between rounded-lg p-4 shadow-sm border border-gray-200 border-l-4 ${CATEGORY_COLORS[bill.category] || CATEGORY_COLORS.other}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {sortMode === "priority" && (
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-gray-300 flex items-center justify-center text-xs font-bold text-gray-500">
                      {index + 1}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{bill.name}</p>
                      {bill.recurring ? (
                        <span className="text-xs text-gray-400 flex-shrink-0" title="Recurring">🔄</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE[bill.category] || CATEGORY_BADGE.other}`}>
                        {bill.category}
                      </span>
                      <span className="text-xs text-gray-400">
                        Due {new Date(bill.due_date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {bill.recurring && bill.frequency && (
                        <span className="rounded-full bg-indigo-50 text-indigo-600 px-1.5 py-0.5 text-[10px] font-medium">
                          {FREQUENCY_BADGE_LABEL[bill.frequency] || "Monthly"}
                        </span>
                      )}
                      {nextOcc && (
                        <span className="text-[10px] text-gray-400">
                          Next: {nextOcc}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadge(bill.priority)}`}>
                    {priorityLabel(bill.priority)}
                  </span>
                  <span className="font-bold text-gray-900 w-20 text-right">${bill.amount.toFixed(2)}</span>
                  <button
                    onClick={() => startEdit(bill)}
                    className="text-gray-400 hover:text-indigo-500 transition-colors text-sm"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeleteTarget(bill)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Bill"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
