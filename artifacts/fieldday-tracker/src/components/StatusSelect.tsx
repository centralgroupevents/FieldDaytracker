import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import {
  INVENTORY_STATUSES,
  STATUS_STYLES,
  type InventoryItem,
  type InventoryStatus,
} from "../lib/types";

/**
 * Badge-styled dropdown to change an item's status inline.
 * Optimistic; reverts on error. PATCHes /api/inventory/:id/status.
 */
export default function StatusSelect({
  item,
  onUpdate,
}: {
  item: InventoryItem;
  onUpdate?: (item: InventoryItem) => void;
}) {
  const [status, setStatus] = useState<InventoryStatus>(item.status);
  const [pending, setPending] = useState(false);

  useEffect(() => setStatus(item.status), [item.status]);

  async function change(next: InventoryStatus) {
    const previous = status;
    setStatus(next);
    setPending(true);
    try {
      const res = await apiFetch(`/api/inventory/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(previous);
      } else if (data.item) {
        setStatus(data.item.status);
        onUpdate?.(data.item);
      }
    } catch {
      setStatus(previous);
    } finally {
      setPending(false);
    }
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
