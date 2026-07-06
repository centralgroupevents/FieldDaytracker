import { createAdminClient } from "@/lib/supabase/admin";
import OutreachClient from "@/components/OutreachClient";
import type { OutreachContact, OutreachTemplate } from "@/lib/types";

// This tool has no login, so we read with the service-role client (same
// approach the server actions use) rather than the RLS-gated anon client.
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const supabase = createAdminClient();

  const [{ data: contacts }, { data: templates }] = await Promise.all([
    supabase
      .from("outreach_contacts")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("outreach_templates")
      .select("*")
      .order("name", { ascending: true }),
  ]);

  return (
    <OutreachClient
      initialContacts={(contacts ?? []) as OutreachContact[]}
      initialTemplates={(templates ?? []) as OutreachTemplate[]}
    />
  );
}
