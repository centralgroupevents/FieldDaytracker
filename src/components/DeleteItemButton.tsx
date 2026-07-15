"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteItem } from "@/app/actions/inventory";

/**
 * Two-tap delete: first tap arms the button ("Delete?"), second tap calls the
 * deleteItem server action. Disarms automatically after a few seconds.
 */
export default function DeleteItemButton({
  id,
  itemName,
}: {
  id: string;
  itemName: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!armed) {
      setArmed(true);
      setError(null);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    startTransition(async () => {
      const res = await deleteItem(id);
      if (!res.ok) setError(res.error ?? "Delete failed");
    });
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={armed ? `Confirm delete ${itemName}` : `Delete ${itemName}`}
        className={`inline-flex h-8 items-center justify-center gap-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-40 ${
          armed
            ? "border-red-600 bg-red-600 px-2.5 text-white hover:bg-red-700"
            : "w-8 border-gray-300 bg-white text-gray-400 hover:border-red-300 hover:text-red-600"
        }`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : armed ? (
          "Delete?"
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
      {error && <span className="mt-0.5 text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
