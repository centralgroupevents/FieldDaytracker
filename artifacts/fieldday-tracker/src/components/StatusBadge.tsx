import { STATUS_STYLES, type InventoryStatus } from "../lib/types";

export default function StatusBadge({ status }: { status: InventoryStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
