"use client";

import { useState, useEffect, useTransition } from "react";
import { setStatus } from "@/app/actions/inventory";
import {
  INVENTORY_STATUSES,
  STATUS_STYLES,
  type InventoryItem,
  type InventoryStatus,
} from "@/lib/types";

/**
 * Badge-styled dropdown to change an item's status inline via the setStatus
 * server action. Optimistic; reverts on error.
 */
export default function StatusSelect({ item }: { item: InventoryItem }) {
  const [status, setStatusValue] = useState<InventoryStatus>(item.status);
  const [pending, startTransition] = useTransition();

  useEffect(() => setStatusValue(item.status), [item.status]);

  function change(next: InventoryStatus) {
    const previous = status;
    setStatusValue(next);
    startTransition(async () => {
      const res = await setStatus(item.id, next);
      if (!res.ok) setStatusValue(previous);
      else if (res.item) setStatusValue(res.item.status);
    });
  }

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value as InventoryStatus)}
      aria-label="Change status"
      className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium outline-none ring-1 ring-inset disabled:opacity-60 ${STATUS_STYLES[status]}`}
    >
      {INVENTORY_STATUSES.map((s) => (
        <option key={s} value={s} className="bg-white text-gray-900">
          {s}
        </option>
      ))}
    </select>
  );
}
