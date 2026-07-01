import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PlusCircle } from "lucide-react";
import type { InventoryItem } from "../lib/types";
import { apiFetch } from "../lib/api";
import InventoryList from "../components/InventoryList";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/inventory")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleUpdate(updated: InventoryItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inventory ({items.length})</h2>
        <Link
          href="/add"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <PlusCircle className="h-4 w-4" />
          Add
        </Link>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load inventory: {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <InventoryList items={items} onUpdate={handleUpdate} />
      )}
    </div>
  );
}
