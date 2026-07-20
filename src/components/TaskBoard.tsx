"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, RefreshCw, ListChecks } from "lucide-react";
import { setTaskStatus } from "@/app/actions/tasks";
import type { Board, BoardBlock, TaskStatus } from "@/lib/digest";

// Per-person colors. Keyed by lowercased name; unknown names fall back to gray.
const PERSON_STYLES: Record<string, { chip: string; dot: string }> = {
  anthony: { chip: "bg-blue-100 text-blue-700 ring-blue-600/20", dot: "bg-blue-500" },
  ab: { chip: "bg-emerald-100 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  calvin: { chip: "bg-violet-100 text-violet-700 ring-violet-600/20", dot: "bg-violet-500" },
  pri: { chip: "bg-amber-100 text-amber-700 ring-amber-600/20", dot: "bg-amber-500" },
};
const FALLBACK = { chip: "bg-gray-100 text-gray-700 ring-gray-600/20", dot: "bg-gray-400" };

function personStyle(name: string) {
  return PERSON_STYLES[name.toLowerCase()] ?? FALLBACK;
}

function keyOf(person: string, day: string): string {
  return `${person.toLowerCase()}|${day}`;
}

export default function TaskBoard({ board }: { board: Board }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("All");
  const [refreshing, startRefresh] = useTransition();

  // Optimistic status overrides, keyed by person|day.
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});

  // Light auto-refresh so sheet edits show up without a manual reload.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  // Clear optimistic overrides whenever fresh server data arrives.
  useEffect(() => {
    setOverrides({});
  }, [board]);

  const tabs = useMemo(() => ["All", ...board.people], [board.people]);

  const visibleDays = board.days
    .map((day) => ({
      ...day,
      blocks:
        filter === "All"
          ? day.blocks
          : day.blocks.filter((b) => b.person === filter),
    }))
    .filter((day) => day.blocks.length > 0);

  function statusOf(block: BoardBlock): TaskStatus | null {
    return overrides[keyOf(block.person, block.dayKey)] ?? block.status;
  }

  function toggle(block: BoardBlock, next: TaskStatus) {
    const k = keyOf(block.person, block.dayKey);
    setOverrides((o) => ({ ...o, [k]: next }));
    startRefresh(async () => {
      await setTaskStatus({
        person: block.person,
        day: block.dayKey,
        label: block.label,
        status: next,
      });
      router.refresh();
    });
  }

  const { today, overdue, total } = board.counts;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <section className="grid grid-cols-3 gap-3">
        <Kpi label="Today" value={today} accent="text-brand" />
        <Kpi label="Overdue" value={overdue} accent="text-red-600" />
        <Kpi label="Total (2wk)" value={total} accent="text-gray-700" />
      </section>

      {/* Filter chips + refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 py-0.5">
          {tabs.map((name) => {
            const active = filter === name;
            const style = name === "All" ? null : personStyle(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => setFilter(name)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                  active
                    ? "bg-gray-900 text-white ring-gray-900"
                    : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-50"
                }`}
              >
                {style && (
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                )}
                {name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
          aria-label="Refresh"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {visibleDays.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">
            No tasks in this window{filter !== "All" ? ` for ${filter}` : ""}.
          </p>
        </div>
      )}

      {/* Day sections */}
      <div className="space-y-6">
        {visibleDays.map((day) => (
          <section key={day.dayKey}>
            <div className="mb-2 flex items-baseline gap-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  day.kicker === "CATCH-UP" ? "text-red-600" : "text-amber-700"
                }`}
              >
                {day.kicker}
              </span>
              <span className="text-xs font-medium text-gray-400">
                {day.dateLabel}
              </span>
            </div>
            <ul className="space-y-3">
              {day.blocks.map((block) => (
                <BlockCard
                  key={`${block.person}-${block.dayKey}`}
                  block={block}
                  status={statusOf(block)}
                  onSet={(s) => toggle(block, s)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="pt-1 text-center text-[11px] text-gray-400">
        Live mirror of the team schedule · refreshes every minute
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-sm">
      <p className={`text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
    </div>
  );
}

function BlockCard({
  block,
  status,
  onSet,
}: {
  block: BoardBlock;
  status: TaskStatus | null;
  onSet: (s: TaskStatus) => void;
}) {
  const style = personStyle(block.person);
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style.chip}`}
          >
            <span className={`h-2 w-2 rounded-full ${style.dot}`} />
            {block.person}
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      {block.milestone && (
        <p className="mt-2 font-semibold leading-snug text-gray-900">
          {block.milestone}
        </p>
      )}

      <ul className="mt-1.5 space-y-1">
        {block.tasks.map((t, i) => (
          <li
            key={i}
            className="flex gap-2 text-sm leading-snug text-gray-600"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
            <span>{t}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onSet("done")}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            status === "done"
              ? "bg-emerald-600 text-white"
              : "border border-gray-300 bg-white text-gray-600 hover:border-emerald-400 hover:text-emerald-700"
          }`}
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
        <button
          type="button"
          onClick={() => onSet("progress")}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            status === "progress"
              ? "bg-amber-500 text-white"
              : "border border-gray-300 bg-white text-gray-600 hover:border-amber-400 hover:text-amber-700"
          }`}
        >
          <Clock className="h-3.5 w-3.5" /> In Progress
        </button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: TaskStatus | null }) {
  if (status === "done") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        Done
      </span>
    );
  }
  if (status === "progress") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
        In Progress
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-500/20">
      Not started
    </span>
  );
}
