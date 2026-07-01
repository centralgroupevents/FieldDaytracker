"use client";

import { useState, useEffect, useTransition } from "react";
import { Minus, Plus, Loader2 } from "lucide-react";
import { updateStock, updateTarget } from "@/app/actions/inventory";

/**
 * Inline +/- stepper. Adjusts current_stock or target_quantity depending on
 * `field`, via the matching server action. Optimistic; reverts on error.
 */
export default function QuickEdit({
  id,
  value: initial,
  field = "stock",
}: {
  id: string;
  value: number;
  field?: "stock" | "target";
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(initial), [initial]);

  function commit(next: number) {
    const clamped = Math.max(0, next);
    const previous = value;
    setValue(clamped);
    setError(null);
    startTransition(async () => {
      const res =
        field === "stock"
          ? await updateStock(id, clamped)
          : await updateTarget(id, clamped);
      if (!res.ok) {
        setValue(previous);
        setError(res.error ?? "Update failed");
      } else if (res.item) {
        setValue(
          field === "stock" ? res.item.current_stock : res.item.target_quantity
        );
      }
    });
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
