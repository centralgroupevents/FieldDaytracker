export const INVENTORY_STATUSES = [
  "Needed",
  "Pending Order",
  "Shipped",
  "Delivered",
  "Picked Up",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export interface InventoryItem {
  id: string;
  item_name: string;
  image_url: string | null;
  unit_price: number;
  target_quantity: number;
  current_stock: number;
  /** Generated in Postgres: target_quantity - current_stock */
  delta: number;
  status: InventoryStatus;
  tracking_number: string | null;
  carrier: string | null;
  /** Generated in Postgres: unit_price * current_stock */
  total_cost: number;
  created_at: string;
  updated_at: string;
}

/** Tailwind classes for each status badge. */
export const STATUS_STYLES: Record<InventoryStatus, string> = {
  Needed: "bg-red-100 text-red-700 ring-red-600/20",
  "Pending Order": "bg-amber-100 text-amber-700 ring-amber-600/20",
  Shipped: "bg-blue-100 text-blue-700 ring-blue-600/20",
  Delivered: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  "Picked Up": "bg-violet-100 text-violet-700 ring-violet-600/20",
};
