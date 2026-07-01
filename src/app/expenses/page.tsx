import { createAdminClient } from "@/lib/supabase/admin";
import type { Expense } from "@/lib/types";
import ExpensesClient from "@/components/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .order("created_at", { ascending: false });

  return <ExpensesClient initial={(data ?? []) as Expense[]} />;
}
