import { useEffect, useState } from "react";
import { DollarSign, PackageX, Truck } from "lucide-react";
import type { InventoryItem, Expense } from "../lib/types";
import { apiFetch } from "../lib/api";
import KpiCard from "../components/KpiCard";
import InventoryList from "../components/InventoryList";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/inventory").then((r) => r.json()),
      apiFetch("/api/expenses").then((r) => r.json()),
    ])
      .then(([inv, exp]) => {
        setItems(Array.isArray(inv) ? inv : []);
        setExpenses(Array.isArray(exp) ? exp : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleUpdate(updated: InventoryItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  const inventorySpent = items.reduce((sum, i) => sum + Number(i.total_cost), 0);
  const expensesSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalSpent = inventorySpent + expensesSpent;
  const itemsMissing = items.filter((i) => i.delta > 0).length;
  const inTransit = items.filter((i) => i.status === "Shipped").length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load inventory: {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Total Budget Spent"
          value={money(totalSpent)}
          icon={DollarSign}
          accent="text-emerald-600"
        />
        <KpiCard
          label="Items Missing"
          value={String(itemsMissing)}
          icon={PackageX}
          accent="text-red-600"
        />
        <KpiCard
          label="In Transit"
          value={String(inTransit)}
          icon={Truck}
          accent="text-blue-600"
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent items
        </h2>
        <InventoryList items={items.slice(0, 5)} onUpdate={handleUpdate} />
      </section>
    </div>
  );
}
