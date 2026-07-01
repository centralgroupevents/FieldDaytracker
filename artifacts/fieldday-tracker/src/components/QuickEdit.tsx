import { useState } from "react";
import { Minus, Plus, Loader2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { InventoryItem } from "../lib/types";

export default function QuickEdit({
  id,
  stock,
  onUpdate,
}: {
  id: string;
  stock: number;
  onUpdate?: (item: InventoryItem) => void;
}) {
  const [value, setValue] = useState(stock);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(next: number) {
    const clamped = Math.max(0, next);
    const previous = value;
    setValue(clamped);
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ stock: clamped }),
      });
      const data = await res.json();
      if (!res.ok) {
        setValue(previous);
        setError(data.error ?? "Update failed");
      } else if (data.item) {
        setValue(data.item.current_stock);
        onUpdate?.(data.item);
      }
    } catch {
      setValue(previous);
      setError("Update failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Decrease stock"
          onClick={() => commit(value - 1)}
          disabled={pending || value <= 0}
          className="grid h-8 w-8 place-items-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums">
          {pending ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-400" />
          ) : (
            value
          )}
        </span>
        <button
          type="button"
          aria-label="Increase stock"
          onClick={() => commit(value + 1)}
          disabled={pending}
          className="grid h-8 w-8 place-items-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
