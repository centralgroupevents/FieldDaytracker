import type { LucideIcon } from "lucide-react";

export default function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "text-brand",
  sub,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <Icon className={`h-5 w-5 ${accent}`} aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
