import { useState, useEffect } from "react";
import { Minus, Plus, Loader2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import type { InventoryItem } from "../lib/types";

/**
 * Inline +/- stepper. Edits either current_stock or target_quantity depending
 * on `field`, PATCHing the matching endpoint.
 */
export default function QuickEdit({
  id,
  value: initial,
  field = "stock",
  onUpdate,
}: {
  id: string;
  value: number;
  field?: "stock" | "target";
  onUpdate?: (item: InventoryItem) => void;
}) {
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep in sync when the parent refreshes the item (e.g. after other edits).
  useEffect(() => setValue(initial), [initial]);

  async function commit(next: number) {
    const clamped = Math.max(0, next);
    const previous = value;
    setValue(clamped);
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}/${field}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: clamped }),
      });
      const data = await res.json();
      if (!res.ok) {
        setValue(previous);
        setError(data.error ?? "Update failed");
      } else if (data.item) {
        setValue(
          field === "stock" ? data.item.current_stock : data.item.target_quantity
        );
        onUpdate?.(data.item);
      }
    } catch {
      setValue(previous);
      setError("Update failed");
    } finally {
      setPending(false);
    }
  }

  const label = field === "stock" ? "stock" : "target";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => commit(value - 1)}
          disabled={pending || value <= 0}
          className="grid h-8 w-8 place-items-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
          {pending ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-400" />
          ) : (
            value
          )}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
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
