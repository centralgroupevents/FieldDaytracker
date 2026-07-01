"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Check, Camera, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from "@/app/actions/expenses";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/types";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

const CATEGORY_STYLES: Record<string, string> = {
  Permit: "bg-blue-100 text-blue-700",
  Labor: "bg-amber-100 text-amber-700",
  Vendor: "bg-violet-100 text-violet-700",
  Rental: "bg-emerald-100 text-emerald-700",
  Food: "bg-pink-100 text-pink-700",
  Other: "bg-gray-100 text-gray-600",
};

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export default function ExpensesClient({ initial }: { initial: Expense[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [expenses, setExpenses] = useState<Expense[]>(initial);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Permit");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const unpaid = expenses
    .filter((e) => !e.paid)
    .reduce((s, e) => s + Number(e.amount), 0);

  async function uploadPhoto(file: File): Promise<string> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `expense-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("item-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    return supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
  }

  function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const receipt_url = receiptFile ? await uploadPhoto(receiptFile) : null;
        const res = await createExpense({
          description: description.trim(),
          amount: Number(amount) || 0,
          category,
          notes: notes || null,
          receipt_url,
          paid: false,
        });
        if (!res.ok || !res.expense) throw new Error(res.error || "Failed to add");
        setExpenses((prev) => [res.expense as Expense, ...prev]);
        setDescription("");
        setAmount("");
        setNotes("");
        setCategory("Permit");
        setReceiptFile(null);
        setReceiptPreview(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add expense");
      }
    });
  }

  function togglePaid(exp: Expense) {
    startTransition(async () => {
      const res = await updateExpense(exp.id, { paid: !exp.paid });
      if (res.ok && res.expense) {
        setExpenses((prev) =>
          prev.map((e) => (e.id === exp.id ? (res.expense as Expense) : e))
        );
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteExpense(id);
      if (res.ok) {
        setExpenses((prev) => prev.filter((e) => e.id !== id));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Expenses</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total expenses
          </p>
          <p className="mt-1 text-2xl font-bold">{money(total)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Unpaid
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">{money(unpaid)}</p>
        </div>
      </div>

      <form
        onSubmit={addExpense}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <p className="text-sm font-semibold">Add an expense</p>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Park permit, DJ payment"
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount ($)"
            className={inputClass}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className={inputClass}
        />
        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-600">
            Receipt photo (optional)
          </span>
          {receiptPreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptPreview}
                alt="Receipt"
                className="h-24 w-24 rounded-xl object-cover ring-1 ring-gray-200"
              />
              <button
                type="button"
                onClick={() => {
                  setReceiptFile(null);
                  setReceiptPreview(null);
                }}
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-gray-900 text-white"
                aria-label="Remove receipt"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand hover:text-brand">
              <Camera className="h-5 w-5" />
              <span className="text-[10px] font-medium">Snap / upload</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setReceiptFile(f);
                  setReceiptPreview(f ? URL.createObjectURL(f) : null);
                }}
                className="hidden"
              />
            </label>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || !description.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add expense
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No expenses yet. Add permits, payments, and vendor costs above.
        </p>
      ) : (
        <ul className="space-y-3">
          {expenses.map((exp) => (
            <li
              key={exp.id}
              className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{exp.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        CATEGORY_STYLES[exp.category] ?? CATEGORY_STYLES.Other
                      }`}
                    >
                      {exp.category}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        exp.paid
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {exp.paid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                  {exp.notes && (
                    <p className="mt-1 text-xs italic text-gray-400">{exp.notes}</p>
                  )}
                  {exp.receipt_url && (
                    <a
                      href={exp.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={exp.receipt_url}
                        alt="Receipt"
                        className="h-14 w-14 rounded-lg object-cover ring-1 ring-gray-200 hover:ring-brand"
                      />
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="font-bold tabular-nums">
                    {money(Number(exp.amount))}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => togglePaid(exp)}
                      title={exp.paid ? "Mark unpaid" : "Mark paid"}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                    >
                      <Check
                        className={`h-4 w-4 ${
                          exp.paid ? "text-emerald-600" : "text-gray-400"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(exp.id)}
                      title="Delete"
                      className="grid h-7 w-7 place-items-center rounded-lg border border-gray-300 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
