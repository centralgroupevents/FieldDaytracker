import Image from "next/image";
import { ExternalLink, Package } from "lucide-react";
import { trackingLink, type InventoryItem } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import QuickEdit from "./QuickEdit";

/** Carrier + clickable tracking link (or a plain dash when none). */
function CarrierCell({ item }: { item: InventoryItem }) {
  const href = trackingLink(item.carrier, item.tracking_number, item.tracking_url);
  const carrier = item.carrier ?? "—";
  if (!href) return <span className="text-xs text-gray-400">{carrier}</span>;
  return (
    <span className="text-xs text-gray-400">
      {carrier}
      {item.tracking_number ? " · " : ""}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-0.5 text-brand hover:underline"
      >
        {item.tracking_number ?? "Track"}
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/**
 * Responsive inventory view:
 *  - Mobile: stacked cards.
 *  - md+: a real data table.
 * Both render the same data; visibility is toggled with Tailwind.
 */
export default function InventoryList({ items }: { items: InventoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <Package className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-500">
          No items yet. Tap “Add Item” to create one.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="flex gap-3">
              <Thumb url={item.image_url} name={item.item_name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{item.item_name}</p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {money(item.unit_price)} · {item.current_stock}/
                  {item.target_quantity} on hand
                  {item.delta > 0 && (
                    <span className="ml-1 font-medium text-red-600">
                      (need {item.delta})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Total: {money(item.total_cost)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <CarrierCell item={item} />
              <QuickEdit id={item.id} stock={item.current_stock} />
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Unit</th>
              <th className="px-4 py-3 text-right font-medium">Stock / Target</th>
              <th className="px-4 py-3 text-right font-medium">Δ</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Quick Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb url={item.image_url} name={item.item_name} small />
                    <div>
                      <p className="font-medium">{item.item_name}</p>
                      <CarrierCell item={item} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(item.unit_price)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {item.current_stock} / {item.target_quantity}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    item.delta > 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {item.delta}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(item.total_cost)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <QuickEdit id={item.id} stock={item.current_stock} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Thumb({
  url,
  name,
  small = false,
}: {
  url: string | null;
  name: string;
  small?: boolean;
}) {
  const size = small ? 40 : 56;
  if (!url) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-400"
        style={{ width: size, height: size }}
      >
        <Package className="h-5 w-5" />
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  );
}
