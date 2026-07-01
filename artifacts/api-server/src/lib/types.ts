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
  delta: number;
  status: InventoryStatus;
  tracking_number: string | null;
  carrier: string | null;
  tracking_url: string | null;
  receipt_url: string | null;
  total_cost: number;
  created_at: string;
  updated_at: string;
}
