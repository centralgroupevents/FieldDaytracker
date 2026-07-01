import { DollarSign, PackageX, Truck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InventoryItem, Expense } from "@/lib/types";
import KpiCard from "@/components/KpiCard";
import InventoryList from "@/components/InventoryList";

// Always fetch fresh — inventory changes constantly.
export const dynamic = "force-dynamic";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const [{ data, error }, { data: expData }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("expenses").select("*"),
  ]);

  const items = (data ?? []) as InventoryItem[];
  const expenses = (expData ?? []) as Expense[];

  const inventorySpent = items.reduce((sum, i) => sum + Number(i.total_cost), 0);
  const expensesSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalSpent = inventorySpent + expensesSpent;
  const itemsMissing = items.filter((i) => i.delta > 0).length;
  const inTransit = items.filter((i) => i.status === "Shipped").length;

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load inventory: {error.message}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Total Budget Spent"
          value={money(totalSpent)}
          icon={DollarSign}
          accent="text-emerald-600"
          sub={`Items ${money(inventorySpent)} · Expenses ${money(expensesSpent)}`}
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
        <InventoryList items={items.slice(0, 5)} />
      </section>
    </div>
  );
}
