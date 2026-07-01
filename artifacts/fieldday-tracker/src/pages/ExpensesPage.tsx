import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check } from "lucide-react";
import { apiFetch } from "../lib/api";
import { EXPENSE_CATEGORIES, type Expense } from "../lib/types";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

const CATEGORY_STYLES: Record<string, string> = {
  Permit: "bg-blue-100 text-blue-700",
  Labor: "bg-amber-100 text-amber-700",
  Vendor: "bg-violet-100 text-violet-700",
  Rental: "bg-emerald-100 text-emerald-700",
  Food: "bg-pink-100 text-pink-700",
  Other: "bg-gray-100 text-gray-600",
};

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Permit");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/expenses")
      .then((r) => r.json())
      .then((d) => setExpenses(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const unpaid = expenses
    .filter((e) => !e.paid)
    .reduce((s, e) => s + Number(e.amount), 0);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          description: description.trim(),
          amount: Number(amount) || 0,
          category,
          notes: notes || null,
          paid: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setExpenses((prev) => [data.expense, ...prev]);
      setDescription("");
      setAmount("");
      setNotes("");
      setCategory("Permit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add expense");
    } finally {
      setSaving(false);
    }
  }

  async function togglePaid(exp: Expense) {
    const res = await apiFetch(`/api/expenses/${exp.id}`, {
      method: "PATCH",
      body: JSON.stringify({ paid: !exp.paid }),
    });
    const data = await res.json();
    if (res.ok && data.expense) {
      setExpenses((prev) => prev.map((e) => (e.id === exp.id ? data.expense : e)));
    }
  }

  async function remove(id: string) {
    const res = await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Expenses</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total expenses
          </p>
          <p className="mt-1 text-2xl font-bold">{money(total)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Unpaid
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">{money(unpaid)}</p>
        </div>
      </div>

      <form
        onSubmit={addExpense}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <p className="text-sm font-semibold">Add an expense</p>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Park permit, DJ payment"
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount ($)"
            className={inputClass}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={saving || !description.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add expense
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No expenses yet. Add permits, payments, and vendor costs above.
        </p>
      ) : (
        <ul className="space-y-3">
          {expenses.map((exp) => (
            <li
              key={exp.id}
              className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{exp.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        CATEGORY_STYLES[exp.category] ?? CATEGORY_STYLES.Other
                      }`}
                    >
                      {exp.category}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        exp.paid
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {exp.paid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                  {exp.notes && (
                    <p className="mt-1 text-xs italic text-gray-400">{exp.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-bold tabular-nums">
                    {money(Number(exp.amount))}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => togglePaid(exp)}
                      title={exp.paid ? "Mark unpaid" : "Mark paid"}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                    >
                      <Check
                        className={`h-4 w-4 ${
                          exp.paid ? "text-emerald-600" : "text-gray-400"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(exp.id)}
                      title="Delete"
                      className="grid h-7 w-7 place-items-center rounded-lg border border-gray-300 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
