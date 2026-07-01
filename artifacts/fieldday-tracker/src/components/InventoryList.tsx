import { type ReactNode } from "react";
import { ExternalLink, Package } from "lucide-react";
import { trackingLink, type InventoryItem } from "../lib/types";
import StatusSelect from "./StatusSelect";
import QuickEdit from "./QuickEdit";

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
        className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
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

function Thumb({ url, name, small = false }: { url: string | null; name: string; small?: boolean }) {
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
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export default function InventoryList({
  items,
  onUpdate,
}: {
  items: InventoryItem[];
  onUpdate?: (item: InventoryItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <Package className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-500">
          No items yet. Tap "Add Item" to create one.
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
                  <p className="line-clamp-2 font-semibold">{item.item_name}</p>
                  <StatusSelect item={item} onUpdate={onUpdate} />
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {money(item.unit_price)} each · Total {money(item.total_cost)}
                  {item.delta > 0 && (
                    <span className="ml-1 font-medium text-red-600">
                      (need {item.delta})
                    </span>
                  )}
                </p>
                {item.notes && (
                  <p className="mt-1 line-clamp-2 text-xs italic text-gray-400">
                    {item.notes}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <CarrierCell item={item} />
              <div className="flex items-end gap-4">
                <LabeledStepper label="Stock">
                  <QuickEdit
                    id={item.id}
                    value={item.current_stock}
                    field="stock"
                    onUpdate={onUpdate}
                  />
                </LabeledStepper>
                <LabeledStepper label="Needed">
                  <QuickEdit
                    id={item.id}
                    value={item.target_quantity}
                    field="target"
                    onUpdate={onUpdate}
                  />
                </LabeledStepper>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Unit</th>
              <th className="px-4 py-3 text-center font-medium">Stock</th>
              <th className="px-4 py-3 text-center font-medium">Needed</th>
              <th className="px-4 py-3 text-right font-medium">Δ</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb url={item.image_url} name={item.item_name} small />
                    <div className="min-w-0">
                      <p
                        className="line-clamp-2 max-w-[260px] font-medium"
                        title={item.item_name}
                      >
                        {item.item_name}
                      </p>
                      <CarrierCell item={item} />
                      {item.notes && (
                        <p className="mt-0.5 max-w-[260px] truncate text-xs italic text-gray-400">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusSelect item={item} onUpdate={onUpdate} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(item.unit_price)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <QuickEdit
                      id={item.id}
                      value={item.current_stock}
                      field="stock"
                      onUpdate={onUpdate}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <QuickEdit
                      id={item.id}
                      value={item.target_quantity}
                      field="target"
                      onUpdate={onUpdate}
                    />
                  </div>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LabeledStepper({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}
