"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Expense } from "@/lib/types";

export interface ExpenseResult {
  ok: boolean;
  error?: string;
  expense?: Expense;
}

export async function createExpense(input: {
  description: string;
  amount: number;
  category: string;
  notes?: string | null;
  receipt_url?: string | null;
  paid?: boolean;
}): Promise<ExpenseResult> {
  const supabase = createAdminClient();
  const description = (input.description ?? "").trim();
  if (!description) return { ok: false, error: "Description is required." };

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      description,
      amount: Number(input.amount) || 0,
      category: input.category || "Other",
      paid: Boolean(input.paid),
      notes: input.notes || null,
      receipt_url: input.receipt_url || null,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true, expense: data as Expense };
}

export async function updateExpense(
  id: string,
  patch: {
    description?: string;
    amount?: number;
    category?: string;
    paid?: boolean;
    notes?: string | null;
  }
): Promise<ExpenseResult> {
  const supabase = createAdminClient();
  const p: Record<string, unknown> = {};
  if (patch.description !== undefined) p.description = patch.description;
  if (patch.amount !== undefined) p.amount = Number(patch.amount) || 0;
  if (patch.category !== undefined) p.category = patch.category;
  if (patch.paid !== undefined) p.paid = patch.paid;
  if (patch.notes !== undefined) p.notes = patch.notes || null;

  const { data, error } = await supabase
    .from("expenses")
    .update(p)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true, expense: data as Expense };
}

export async function deleteExpense(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}
