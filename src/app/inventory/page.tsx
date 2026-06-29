import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import InventoryList from "@/components/InventoryList";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });

  const items = (data ?? []) as InventoryItem[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inventory ({items.length})</h2>
        <Link
          href="/add"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          <PlusCircle className="h-4 w-4" />
          Add
        </Link>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load inventory: {error.message}
        </p>
      )}

      <InventoryList items={items} />
    </div>
  );
}
